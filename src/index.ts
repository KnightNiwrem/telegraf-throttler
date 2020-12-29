import Bottleneck from 'bottleneck';
import type { Context } from 'telegraf';
import type { MiddlewareFn } from 'telegraf/typings/composer';

type ThrottlerErrorHandler = (
  ctx: Context,
  next: (ctx?: Context) => Promise<unknown>,
  throttlerName: string,
  error: Error
) => Promise<unknown>

type ThrottlerOptions = {
  group?: Bottleneck.ConstructorOptions,
  in?: Bottleneck.ConstructorOptions,
  out?: Bottleneck.ConstructorOptions,
  onThrottlerError?: ThrottlerErrorHandler,
}

const WEBHOOK_BLACKLIST = [
  'getChat',
  'getChatAdministrators',
  'getChatMember',
  'getChatMembersCount',
  'getFile',
  'getFileLink',
  'getGameHighScores',
  'getMe',
  'getUserProfilePhotos',
  'getWebhookInfo',
  'exportChatInviteLink'
];

export const telegrafThrottler = (
  opts: ThrottlerOptions = {},
): MiddlewareFn<Context> => {
  const groupConfig: Bottleneck.ConstructorOptions = opts.group ?? {
    maxConcurrent: 1,
    minTime: 333,
    reservoir: 20,
    reservoirRefreshAmount: 20,
    reservoirRefreshInterval: 60000,
  };
  const inConfig: Bottleneck.ConstructorOptions = opts.in ?? {
    highWater: 0,
    maxConcurrent: 1,
    minTime: 333,
    strategy: Bottleneck.strategy.OVERFLOW,
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

  const defaultErrorHandler: ThrottlerErrorHandler = async (
    _ctx,
    _next,
    throttlerName,
    error,
  ) => console.warn(`${throttlerName} | ${error.message}`);
  const errorHandler: ThrottlerErrorHandler = opts.onThrottlerError ?? defaultErrorHandler;

  const middleware: MiddlewareFn<Context> = async (ctx, next) => {
    const oldCallApi = ctx.telegram.callApi.bind(ctx.telegram);

    const newCallApi = async function(this: any, method: string, data: { [key: string]: any } = {}) {
      const { chat_id } = data;
      const chatId = Number(chat_id);
      const hasEnabledWebhookReply = this.options.webhookReply;
      const hasResponse = !!this.response;
      const hasEndedResponse = this.responseEnd;
      const isBlacklistedMethod = WEBHOOK_BLACKLIST.includes(method);
      if (isNaN(chatId) || (hasEnabledWebhookReply && hasResponse && !hasEndedResponse && !isBlacklistedMethod)) {
        return oldCallApi(method, data);
      }

      const throttler = chatId > 0 ? outThrottler : groupThrottler.key(`${chatId}`);
      return throttler
        .schedule(() => oldCallApi(method, data))
        .catch(error => errorHandler(ctx, next, `Outbound ${chatId}`, error));
    }
    ctx.telegram.callApi = newCallApi.bind(ctx.telegram);

    const chatId = Number(ctx.chat?.id);
    if (isNaN(chatId)) {
      return next();
    }
    return inThrottler
      .key(`${chatId}`)
      .schedule(() => next())
      .catch(error => errorHandler(ctx, next, `Inbound ${chatId}`, error));
  };
  return middleware;
};

export default telegrafThrottler;
