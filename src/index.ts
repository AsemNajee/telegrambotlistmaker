import express from 'express';
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { connectDB } from './core/database';
import { setupMainBot } from './handlers/mainBotHandler';
import { botManager } from './services/botManager';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const mainBot = new Telegraf(process.env.MAIN_BOT_TOKEN!);

// إعداد البوت الرئيسي
setupMainBot(mainBot);

// مسار البوت الرئيسي
app.post('/api/main-bot', async (req, res) => {
  try {
    await connectDB(); // التأكد من الاتصال قبل المعالجة
    await mainBot.handleUpdate(req.body, res);
  } catch (error) {
    console.error('Error handling main bot update:', error);
    res.status(500).send('Internal Server Error');
  }
});

// مسار البوتات المصنوعة ديناميكياً
app.post('/api/bot/:token', async (req, res) => {
  const { token } = req.params;
  try {
    await connectDB();
    const bot = await botManager.getOrInitBot(token);
    if (bot) {
      await bot.handleUpdate(req.body, res);
    } else {
      res.status(404).send('Bot not found');
    }
  } catch (error) {
    console.error('Error handling child bot update:', error);
    res.status(500).send('Internal Server Error');
  }
});

// مسار لتفعيل الـ Webhook يدوياً
app.get('/api/setup-webhook', async (req, res) => {
  const domain = process.env.WEBHOOK_DOMAIN;
  if (!domain) return res.status(400).send('WEBHOOK_DOMAIN is not set');
  
  try {
    await mainBot.telegram.setWebhook(`${domain}/api/main-bot`);
    res.send(`Webhook set to ${domain}/api/main-bot`);
  } catch (error: any) {
    res.status(500).send(`Error setting webhook: ${error.message}`);
  }
});

app.get('/', (req, res) => res.send('Bot Maker is running!'));

if (process.env.NODE_ENV !== 'production') {
  connectDB().then(() => {
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  });
}

export default app;


