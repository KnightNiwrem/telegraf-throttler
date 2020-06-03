# Telegraf Throttler
Throttling middleware for [Telegraf](https://github.com/telegraf/telegraf) bot framework, written in [Typescript](https://www.typescriptlang.org/) and built with [Bottleneck](https://github.com/SGrondin/bottleneck).

## Installation
```
yarn install telegraf-throttler
```

## About
This throttler aims to throttle incoming updates from Telegram, and outgoing calls to the Telegram API. The incoming throttler aims to protect the bot from abuses (e.g. user forwarding tons of messages to the bot to flood it), while the outgoing throttler aims to limit and queue outgoing Telegram API calls to conform to the official [Telegram API rate limits](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this).

## Configuration
The throttler accepts a single optional argument of the following form:
```
type ThrottlerOptions = {
  group?: Bottleneck.ConstructorOptions,    # For throttling outgoing group messages
  in?: Bottleneck.ConstructorOptions,       # For throttling incoming messages
  out?: Bottleneck.ConstructorOptions,      # For throttling outgoing private messages
  onThrottlerError?: ThrottlerErrorHandler, # For custom throttler error handling
}
```

The full list of object properties available for `Bottleneck.ConstructorOptions` can be found at [Bottleneck](https://github.com/SGrondin/bottleneck#constructor).

If no argument is passed, the throttler created will use the default configuration settings which should be appropriate for most use cases. The default configuration are as follows:
```
# Outgoing Group Throttler
const groupConfig = {
  maxConcurrent: 1,                # Only 1 job at a time
  minTime: 333,                    # Wait this many milliseconds to be ready, after a job
  reservoir: 20,                   # Number of new jobs that throttler will accept at start
  reservoirRefreshAmount: 20,      # Number of jobs that throttler will accept after refresh
  reservoirRefreshInterval: 60000, # Interval in milliseconds where reservoir will refresh
};

# Incoming Throttler
const inConfig = {
  highWater: 0,                           # Trigger strategy if throttler is not ready for a new job
  maxConcurrent: 1,                       # Only 1 job at a time
  minTime: 333,                           # Wait this many milliseconds to be ready, after a job
  strategy: Bottleneck.strategy.OVERFLOW, # Drop jobs if throttler is not ready
}

# Outgoing Private Throttler
const outConfig = {
  minTime: 25,                    # Wait this many milliseconds to be ready, after a job
  reservoir: 30,                  # Number of new jobs that throttler will accept at start
  reservoirRefreshAmount: 30,     # Number of jobs that throttler will accept after refresh
  reservoirRefreshInterval: 1000, # Interval in milliseconds where reservoir will refresh
};

# Default Error Handler
const defaultErrorHandler = async (ctx, next, throttlerName, error) => {
  return console.warn(`${throttlerName} | ${error.message}`)
};
```

## Example
```
# Simple use case (Typescript)
import { Telegraf } from 'telegraf';
import telegrafThrottler from 'telegraf-throttler';

const bot = new Telegraf(process.env.BOT_TOKEN);

const throttler = telegrafThrottler();
bot.use(throttler);

bot.command('/example', ctx => ctx.reply('I am throttled'));
bot.launch();
```

```
# Simple use case (Javascript)
const { Telegraf } = require('telegraf');
const { telegrafThrottler } = require('telegraf-throttler');

const bot = new Telegraf(process.env.BOT_TOKEN);

const throttler = telegrafThrottler();
bot.use(throttler);

bot.command('/example', ctx => ctx.reply('I am throttled'));
bot.launch();
```

```
# Custom use case (Typescript)
import { Telegraf } from 'telegraf';
import telegrafThrottler from 'telegraf-throttler';

const bot = new Telegraf(process.env.BOT_TOKEN);

# 
const throttler = telegrafThrottler({
  out: {
    minTime: 25,                     # Wait this many milliseconds to be ready, after a job
    reservoir: 3,                    # Number of new jobs that throttler will accept at start
    reservoirRefreshAmount: 3,       # Number of jobs that throttler will accept after refresh
    reservoirRefreshInterval: 10000, # Interval in milliseconds where reservoir will refresh
  },
});
bot.use(throttler);

bot.command('/example', ctx => ctx.reply('I am seriously throttled!'));
bot.launch();
```


