import Bottleneck from 'bottleneck';
import type { Context, Middleware } from 'telegraf';

export type ThrottlerInErrorHandler = (
  ctx: Context,
  next: (ctx?: Context) => Promise<unknown>,
  error: Error
) => Promise<unknown>

export type ThrottlerOptions = {
  group?: Bottleneck.ConstructorOptions,
  in?: Bottleneck.ConstructorOptions,
  out?: Bottleneck.ConstructorOptions,
  inThrottlerError?: ThrottlerInErrorHandler,
}

const WEBHOOK_REPLY_METHOD_ALLOWLIST = new Set<string>([
  'answerCallbackQuery',
  'answerInlineQuery',
  'deleteMessage',
  'leaveChat',
  'sendChatAction',
]);

export const telegrafThrottler = (
  opts: ThrottlerOptions = {},
): Middleware<Context> => {
  const groupConfig: Bottleneck.ConstructorOptions = opts.group ?? {
    maxConcurrent: 1,
    minTime: 333,
    reservoir: 20,
    reservoirRefreshAmount: 20,
    reservoirRefreshInterval: 60000,
  };
  const inConfig: Bottleneck.ConstructorOptions = opts.in ?? {
    highWater: 3,
    maxConcurrent: 1,
    minTime: 333,
    strategy: Bottleneck.strategy.LEAK,
  };
  const outConfig: Bottleneck.ConstructorOptions = opts.out ?? {
    minTime: 25,
    reservoir: 30,
    reservoirRefreshAmount: 30,
    reservoirRefreshInterval: 1000,
  };

  const groupThrottler = new Bottleneck.Group(groupConfig);
  const inThrottler = new Bottleneck.Group(inConfig);
  const outThrottler = new Bottleneck(outConfig);
  groupThrottler.on('created', throttler => throttler.chain(outThrottler));

  const defaultInErrorHandler: ThrottlerInErrorHandler = async (
    ctx,
    _next,
    error,
  ) => console.warn(`Inbound ${ctx.from?.id || ctx.chat?.id} | ${error.message}`);
  const errorHandler: ThrottlerInErrorHandler = opts.inThrottlerError ?? defaultInErrorHandler;

  const middleware: Middleware<Context> = async (ctx, next) => {
    const oldCallApi = ctx.telegram.callApi.bind(ctx.telegram);

    const newCallApi: typeof ctx.telegram.callApi = async function newCallApi(this: typeof ctx.telegram, method, payload, { signal } = {}) {
      if (!('chat_id' in payload)) {
        return oldCallApi(method, payload, { signal });
      }

      // @ts-ignore
      const chatId = Number(payload.chat_id);
      const hasEnabledWebhookReply = this.options.webhookReply;
      // @ts-ignore
      const hasEndedResponse = this.response?.writableEnded;
      const isAllowedMethod = WEBHOOK_REPLY_METHOD_ALLOWLIST.has(method);
      if (isNaN(chatId) || (hasEnabledWebhookReply && !hasEndedResponse && isAllowedMethod)) {
        return oldCallApi(method, payload, { signal });
      }

      const throttler = chatId > 0 ? outThrottler : groupThrottler.key(`${chatId}`);
      return throttler.schedule(() => oldCallApi(method, payload, { signal }));
    };
    ctx.telegram.callApi = newCallApi.bind(ctx.telegram);

    const fromId = Number(ctx.from?.id);
    const chatId = Number(ctx.chat?.id);
    const inKey = fromId || chatId;
    if (isNaN(inKey)) {
      return next();
    }
    try {
      return await inThrottler
        .key(`${inKey}`)
        .schedule(() => next());
    } catch (error) {
      if (error instanceof Bottleneck.BottleneckError) {
        return errorHandler(ctx, next, error);
      } else {
        throw error;
      }
    }
  };
  return middleware;
};

export default telegrafThrottler;
