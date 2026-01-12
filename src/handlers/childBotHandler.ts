import { Context, Telegraf, Markup } from 'telegraf';
import Bot, { IBot } from '../models/Bot';
import Channel from '../models/Channel';

export const setupChildBot = (bot: Telegraf<Context>, botData: IBot) => {
  
  const notifyAdmin = async (message: string) => {
    if (botData.adminGroupId) {
      try {
        await bot.telegram.sendMessage(botData.adminGroupId, `🔔 إشعار إداري:\n${message}`);
      } catch (e) {
        console.error('Failed to notify admin group');
      }
    }
  };

  bot.start((ctx) => {
    if (ctx.from.id === botData.ownerId) {
      ctx.reply('مرحباً بك يا مالك البوت! 👑\n\nاستخدم /help_admin لعرض جميع أوامر الإدارة والتعليمات.');
    } else {
      ctx.reply('مرحباً بك! هذا البوت مخصص لإدارة إعلانات القنوات.\n\n💡 لإضافة قناتك:\n1. ارفع البوت كمسؤول في قناتك.\n2. أرسل رابط القناة إلى مجموعة الاستقبال.\n\n📝 يمكنك تخصيص اسم القناة بإرسالها بهذا الشكل:\nاسم القناة المخصص\nhttps://t.me/your_channel');
    }
  });

  // مراقبة إضافة/إزالة البوت من القنوات
  bot.on('my_chat_member', async (ctx) => {
    const status = ctx.myChatMember.new_chat_member.status;
    const chat = ctx.myChatMember.chat;
    if (chat.type === 'channel') {
      if (status === 'administrator') {
        await notifyAdmin(`✅ تم إضافة البوت كمسؤول في قناة:\n${chat.title} (${chat.id})`);
      } else if (status === 'left' || status === 'kicked') {
        await notifyAdmin(`❌ تم إزالة البوت من قناة:\n${chat.title} (${chat.id})`);
        await Channel.findOneAndDelete({ botId: botData._id, channelId: chat.id });
      }
    }
  });

  bot.command('set_admin', async (ctx) => {
    if (ctx.from.id !== botData.ownerId) return;
    if (ctx.chat.type === 'private') return ctx.reply('يجب إرسال هذا الأمر داخل المجموعة المراد تعيينها كإدارة.');
    await Bot.findByIdAndUpdate(botData._id, { adminGroupId: ctx.chat.id });
    ctx.reply('✅ تم تعيين هذه المجموعة كمجموعة إدارة.');
  });

  bot.command('set_reception', async (ctx) => {
    if (ctx.from.id !== botData.ownerId) return;
    if (ctx.chat.type === 'private') return ctx.reply('يجب إرسال هذا الأمر داخل المجموعة المراد تعيينها كاستقبال.');
    await Bot.findByIdAndUpdate(botData._id, { receptionGroupId: ctx.chat.id });
    ctx.reply('✅ تم تعيين هذه المجموعة كمجموعة استقبال لطلبات القنوات.');
  });

  // تخصيص الرسالة
  bot.command('set_msg', async (ctx) => {
    const isAdmin = ctx.from.id === botData.ownerId || ctx.chat.id === botData.adminGroupId;
    if (!isAdmin) return;
    const msg = ctx.message.text.split(' ').slice(1).join(' ');
    if (!msg) return ctx.reply('📝 يرجى إرسال الرسالة بعد الأمر، مثال:\n/set_msg قائمة القنوات المميزة:');
    await Bot.findByIdAndUpdate(botData._id, { publishMessage: msg });
    ctx.reply('✅ تم تحديث رسالة النشر.');
  });

  // تخصيص عدد الأعمدة
  bot.command('set_cols', async (ctx) => {
    const isAdmin = ctx.from.id === botData.ownerId || ctx.chat.id === botData.adminGroupId;
    if (!isAdmin) return;
    const cols = parseInt(ctx.message.text.split(' ')[1]);
    if (isNaN(cols) || cols < 1 || cols > 5) return ctx.reply('🔢 يرجى إرسال رقم بين 1 و 5 بعد الأمر.');
    await Bot.findByIdAndUpdate(botData._id, { columnsCount: cols });
    ctx.reply(`✅ تم تحديد عدد الأعمدة بـ ${cols}.`);
  });

  // استقبال القنوات
  bot.on('text', async (ctx, next) => {
    if (ctx.chat.id === botData.receptionGroupId) {
      const lines = ctx.message.text.split('\n');
      let customName = '';
      let link = '';

      if (lines.length >= 2) {
        customName = lines[0].trim();
        link = lines[1].trim();
      } else {
        link = lines[0].trim();
      }

      if (link.includes('t.me/') || link.startsWith('@')) {
        try {
          const username = link.includes('t.me/joinchat/') || link.includes('t.me/+') ? link : (link.split('t.me/')[1] || link.replace('@', ''));
          const chat = await bot.telegram.getChat(username.startsWith('http') ? username : '@' + username.split('/')[0]);
          
          if (chat.type !== 'channel') return ctx.reply('❌ هذا الرابط ليس لقناة.');

          const memberCount = await bot.telegram.getChatMembersCount(chat.id);
          const botMember = await bot.telegram.getChatMember(chat.id, (await bot.telegram.getMe()).id);
          
          if (botMember.status !== 'administrator') {
            return ctx.reply('❌ يجب رفع البوت كمسؤول في القناة أولاً.');
          }

          const existing = await Channel.findOne({ botId: botData._id, channelId: chat.id });
          if (existing) return ctx.reply('⚠️ هذه القناة مضافة بالفعل.');

          await Channel.create({
            botId: botData._id,
            ownerId: ctx.from.id,
            channelId: chat.id,
            title: customName || (chat as any).title,
            inviteLink: link,
            memberCount: memberCount,
            isApproved: true
          });

          ctx.reply(`✅ تم إضافة القناة بنجاح:\nالاسم: ${customName || (chat as any).title}\nالأعضاء: ${memberCount}`);
          await notifyAdmin(`➕ قناة جديدة مضافة:\nالاسم: ${customName || (chat as any).title}\nالمضيف: ${ctx.from.first_name}\nالأعضاء: ${memberCount}`);
        } catch (e) {
          ctx.reply('❌ تعذر التحقق من القناة. تأكد من الرابط وصلاحيات البوت.');
        }
      }
    }
    return next();
  });

  bot.command('publish', async (ctx) => {
    const isAdmin = ctx.from.id === botData.ownerId || ctx.chat.id === botData.adminGroupId;
    if (!isAdmin) return;

    const currentBot = await Bot.findById(botData._id);
    const channels = await Channel.find({ botId: botData._id, isApproved: true });
    if (channels.length === 0) return ctx.reply('❌ لا توجد قنوات.');

    const buttons = channels.map(ch => Markup.button.url(ch.title, ch.inviteLink || `https://t.me/${ch.channelId}`));
    const rows = [];
    for (let i = 0; i < buttons.length; i += (currentBot?.columnsCount || 1)) {
      rows.push(buttons.slice(i, i + (currentBot?.columnsCount || 1)));
    }

    const keyboard = Markup.inlineKeyboard(rows);
    let successCount = 0;

    for (const ch of channels) {
      try {
        const sent = await bot.telegram.sendMessage(ch.channelId, currentBot?.publishMessage || '📢 القائمة:', keyboard);
        await Channel.findByIdAndUpdate(ch._id, { lastMessageId: sent.message_id });
        successCount++;
      } catch (e) {}
    }
    ctx.reply(`✅ تم النشر في ${successCount} قناة.`);
  });

  bot.command('delete', async (ctx) => {
    const isAdmin = ctx.from.id === botData.ownerId || ctx.chat.id === botData.adminGroupId;
    if (!isAdmin) return;
    const channels = await Channel.find({ botId: botData._id, lastMessageId: { $exists: true } });
    let count = 0;
    for (const ch of channels) {
      try {
        await bot.telegram.deleteMessage(ch.channelId, ch.lastMessageId!);
        await Channel.findByIdAndUpdate(ch._id, { $unset: { lastMessageId: "" } });
        count++;
      } catch (e) {}
    }
    ctx.reply(`🗑 تم الحذف من ${count} قناة.`);
    await notifyAdmin(`🗑 تم حذف القائمة من جميع القنوات بواسطة ${ctx.from.first_name}`);
  });

  bot.command('help_admin', (ctx) => {
    const isAdmin = ctx.from.id === botData.ownerId || ctx.chat.id === botData.adminGroupId;
    if (!isAdmin) return;
    ctx.reply(`🛠 قائمة أوامر الإدارة:
/set_admin - تعيين هذه المجموعة للإدارة
/set_reception - تعيين هذه المجموعة للاستقبال
/set_msg [النص] - تخصيص رسالة النشر
/set_cols [1-5] - تخصيص عدد الأعمدة
/preview - معاينة القائمة الحالية
/publish - نشر القائمة في القنوات
/delete - حذف القائمة من القنوات
/update_info - تحديث بيانات القنوات والأعضاء

💡 ملاحظة: يتم استقبال القنوات في مجموعة الاستقبال تلقائياً عند إرسال الرابط.`);
  });
};


