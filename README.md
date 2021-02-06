# Telegraf Throttler

[![Known Vulnerabilities](https://snyk.io/test/github/KnightNiwrem/telegraf-throttler/badge.svg)](https://snyk.io/test/github/KnightNiwrem/telegraf-throttler)

Throttling middleware for [Telegraf](https://github.com/telegraf/telegraf) bot framework, written in [Typescript](https://www.typescriptlang.org/) and built with [Bottleneck](https://github.com/SGrondin/bottleneck).

## Installation
```
yarn install telegraf-throttler
```

## About
This throttler aims to throttle incoming updates from Telegram, and outgoing calls to the Telegram API. The incoming throttler aims to protect the bot from abuses (e.g. user forwarding tons of messages to the bot to flood it), while the outgoing throttler aims to limit and queue outgoing Telegram API calls to conform to the official [Telegram API rate limits](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this).

## Configuration
The throttler accepts a single optional argument of the following form:
```typescript
type ThrottlerOptions = {
  group?: Bottleneck.ConstructorOptions,      // For throttling outgoing group messages
  in?: Bottleneck.ConstructorOptions,         // For throttling incoming messages
  out?: Bottleneck.ConstructorOptions,        // For throttling outgoing private messages
  inKey?: 'from' | 'chat',                    // Throttle inbound by from.id (default) or chat.id
  inThrottlerError?: InThrottlerErrorHandler, // For custom inThrottler error handling
}
```

The full list of object properties available for `Bottleneck.ConstructorOptions` can be found at [Bottleneck](https://github.com/SGrondin/bottleneck#constructor).

If no argument is passed, the throttler created will use the default configuration settings which should be appropriate for most use cases. The default configuration are as follows:
```typescript
// Outgoing Group Throttler
const groupConfig = {
  maxConcurrent: 1,                // Only 1 job at a time
  minTime: 333,                    // Wait this many milliseconds to be ready, after a job
  reservoir: 20,                   // Number of new jobs that throttler will accept at start
  reservoirRefreshAmount: 20,      // Number of jobs that throttler will accept after refresh
  reservoirRefreshInterval: 60000, // Interval in milliseconds where reservoir will refresh
};

// Incoming Throttler
const inConfig = {
  highWater: 3,                       // Trigger strategy if throttler is not ready for a new job
  maxConcurrent: 1,                   // Only 1 job at a time
  minTime: 333,                       // Wait this many milliseconds to be ready, after a job
  strategy: Bottleneck.strategy.LEAK, // Drop jobs if throttler is not ready
}

// Outgoing Private Throttler
const outConfig = {
  minTime: 25,                    // Wait this many milliseconds to be ready, after a job
  reservoir: 30,                  // Number of new jobs that throttler will accept at start
  reservoirRefreshAmount: 30,     // Number of jobs that throttler will accept after refresh
  reservoirRefreshInterval: 1000, // Interval in milliseconds where reservoir will refresh
};

// Default Error Handler
const defaultErrorHandler = async (ctx, next, error) => {
  return console.warn(`Inbound ${ctx.from?.id || ctx.chat?.id} | ${error.message}`)
};
```

## Example
```typescript
// Simple use case (Typescript)
import { Telegraf } from 'telegraf';
import { telegrafThrottler } from 'telegraf-throttler';

const bot = new Telegraf(process.env.BOT_TOKEN);

const throttler = telegrafThrottler();
bot.use(throttler);

bot.command('/example', ctx => ctx.reply('I am throttled'));
bot.launch();
```

```typescript
// Simple use case (Javascript)
const { Telegraf } = require('telegraf');
const { telegrafThrottler } = require('telegraf-throttler');

const bot = new Telegraf(process.env.BOT_TOKEN);

const throttler = telegrafThrottler();
bot.use(throttler);

bot.command('/example', ctx => ctx.reply('I am throttled'));
bot.launch();
```

```typescript
// Custom use case (Typescript)
import { Composer, Context, Middleware, Telegraf } from 'telegraf';
import { telegrafThrottler } from 'telegraf-throttler';

const bot = new Telegraf(process.env.BOT_TOKEN);

const privateThrottler = telegrafThrottler();
const groupThrottler = telegrafThrottler({
  in: { // Aggresively drop inbound messages
    highWater: 0,                       // Trigger strategy if throttler is not ready for a new job
    maxConcurrent: 1,                   // Only 1 job at a time
    minTime: 30000,                      // Wait this many milliseconds to be ready, after a job
  },
  inKey: 'chat', // Throttle inbound messages by chat.id instead
});

const partitioningMiddleware: Middleware<Context> = (ctx, next) => {
  const chatId = Number(ctx.chat?.id);
  return Composer.optional(() => chatId < 0, groupThrottler, privateThrottler)(ctx, next);
};
bot.use(partitioningMiddleware);

bot.command('/example', ctx => ctx.reply('I am seriously throttled!'));
bot.launch();
```


