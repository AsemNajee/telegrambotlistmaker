import { Context, Telegraf } from 'telegraf';
import User from '../models/User';
import Bot from '../models/Bot';
import { botManager } from '../services/botManager';

export const setupMainBot = (bot: Telegraf<Context>) => {
  const ADMIN_ID = Number(process.env.ADMIN_ID);

  bot.start(async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    let user = await User.findOne({ telegramId: userId });
    if (!user) {
      user = await User.create({ telegramId: userId, username: ctx.from?.username });
    }

    ctx.reply('مرحباً بك في بوت صانع البوتات! 🤖\n\nيمكنك إنشاء بوت واحد مجاناً لإدارة إعلانات قنواتك.\n\nأرسل /create للبدء.');
  });

  bot.command('create', async (ctx) => {
    const userId = ctx.from?.id;
    const user = await User.findOne({ telegramId: userId });

    if (user?.hasCreatedBot) {
      return ctx.reply('عذراً، يمكنك إنشاء بوت واحد فقط بشكل مجاني.');
    }

    ctx.reply('من فضلك أرسل توكن البوت الخاص بك من @BotFather');
  });

  bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    const userId = ctx.from?.id;

    if (text.includes(':')) {
      const user = await User.findOne({ telegramId: userId });
      if (user?.hasCreatedBot) return;

      try {
        const tempBot = new Telegraf(text);
        const botInfo = await tempBot.telegram.getMe();

        const newBot = await Bot.create({
          ownerId: userId,
          token: text,
          botUsername: botInfo.username
        });

        await User.findOneAndUpdate({ telegramId: userId }, { hasCreatedBot: true });
        
        if (ADMIN_ID) {
          await bot.telegram.sendMessage(ADMIN_ID, `✅ تم إنشاء بوت جديد:\nالمستخدم: ${userId}\nيوزر البوت: @${botInfo.username}`);
        }

        const domain = process.env.WEBHOOK_DOMAIN;
        if (domain) {
          await tempBot.telegram.setWebhook(`${domain}/api/bot/${text}`);
        }

        ctx.reply(`✅ تم إنشاء بوتك بنجاح: @${botInfo.username}\n\nقم بالدخول إليه وإعداده.`);
        
        await botManager.startBot(newBot);

      } catch (error) {
        ctx.reply('❌ التوكن غير صحيح أو حدث خطأ ما.');
      }
    }
  });

  bot.command('bots', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const bots = await Bot.find();
    let message = '📋 قائمة البوتات المصنوعة:\n\n';
    bots.forEach((b, i) => {
      message += `${i + 1}. @${b.botUsername} (Owner: ${b.ownerId})\n`;
    });
    ctx.reply(message);
  });
};


