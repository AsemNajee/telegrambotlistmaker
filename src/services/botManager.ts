import { Telegraf, Context } from 'telegraf';
import Bot, { IBot } from '../models/Bot';
import { setupChildBot } from '../handlers/childBotHandler';

class BotManager {
  private activeBots: Map<string, Telegraf<Context>> = new Map();

  async startAllBots() {
    try {
      const bots = await Bot.find({ isActive: true });
      for (const botData of bots) {
        await this.startBot(botData);
      }
      console.log(`Started ${this.activeBots.size} child bots.`);
    } catch (error) {
      console.error('Failed to start all bots:', error);
    }
  }

  async startBot(botData: IBot) {
    if (this.activeBots.has(botData.token)) return this.activeBots.get(botData.token);

    try {
      const bot = new Telegraf(botData.token);
      setupChildBot(bot, botData);
      this.activeBots.set(botData.token, bot);
      return bot;
    } catch (error) {
      console.error(`Failed to start bot ${botData.botUsername}:`, error);
      return null;
    }
  }

  async getOrInitBot(token: string) {
    let bot = this.activeBots.get(token);
    if (!bot) {
      const botData = await Bot.findOne({ token, isActive: true });
      if (botData) {
        bot = await this.startBot(botData) || undefined;
      }
    }
    return bot;
  }

  getBot(token: string) {
    return this.activeBots.get(token);
  }
}

export const botManager = new BotManager();


