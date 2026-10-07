# ديناري السهل

@secret:TELEGRAM_BOT_TOKEN Build a Telegram bot for personal money tracking, powered by Supabase (Edge Functions + Postgres). The bot's language is Arabic only (RTL), currency is "دج" (Algerian Dinar). Priority: speed and simplicity. The user should add a transaction with ONE short message, no menus needed.



## Architecture

- One Supabase Edge Function `telegram-webhook` receives Telegram updates (webhook).

- Secrets: TELEGRAM_BOT_TOKEN, ALLOWED_TELEGRAM_ID (only this user ID may use the bot; ignore everyone else).

- Add a simple admin page in the Lovable app with a button "Set Webhook" that calls Telegram setWebhook to the Edge Function URL, and shows the webhook status.

- Use Row Level Security off for these tables but access only via the service role inside the Edge Function.



## Database tables

- transactions: id, amount (numeric, positive = income, negative = expense), account ('pocket' | 'bank'), category (text), note (text), created_at (timestamptz)

- loans: id, person (text), amount (numeric, positive = he owes me, negative = I owe him), created_at

- loan_payments: id, person, amount, created_at

- category_keywords: keyword, category (editable mapping, seeded with: أكل/غداء/عشاء/فطور/مطعم/ريزو → أكل; بنزين/كراء/طاكسي/ترامواي → نقل; كهرباء/ماء/انترنت/فاتورة/رصيد → فواتير; راتب/جوست → دخل; etc.)



## Fast input (the core feature)

Any normal text message is parsed as a transaction. Format: [+/-]amount + free words + optional account word.

Examples:

- "-90 غداء جيب" → expense 90, category أكل, account pocket

- "+6000 راتب بنك" → income 6000, category دخل, account bank

- "-1200 كراء" → expense, no account word → use the last used account

Rules:

- Sign: "-" or no sign = expense; "+" = income.

- Account words: جيب/كاش = pocket; بنك/ccp/بريد = bank. Default = last used account.

- Category: match words against category_keywords; if no match → "أخرى".

- Support Arabic-Indic digits (٠١٢٣) and "k" (e.g. 5k = 5000).

- Parse with regex/rules (no AI call) so replies are instant.

- Reply right away with a short confirmation:

  ✅ تم تسجيل العملية!

  📁 الفئة: ...

  💵 الجيب: X دج

  💳 البنك: Y دج

  and an inline button "↩️ تراجع" to delete that transaction.



## Main menu (/start)

Message: "أهلاً إلياس! اختر إجراءً:" with inline buttons (2 per row):

- 💰 الرصيد → shows pocket, bank, and total

- 📜 آخر العمليات → last 10 transactions (date, amount, account, category, note)

- 📂 حسب التصنيف → totals per category for the current month (expenses and income separately), with a button to switch month

- 💳 القروض → list of people with remaining amounts, plus total

- ➕ إضافة عملية → short help text with 3 examples

Also keep a persistent reply keyboard with: الرصيد | آخر العمليات.



## Loans

- "قرضت عبدلطيف 4500" → he now owes me 4500

- "رد عبدلطيف 1000" → payment, reduces his debt

- "استلفت من يوسف 2000" → I owe him

- Loans list shows each person with remaining amount and 👤 icon; when a debt reaches 0, hide it.

- Loans do NOT affect pocket/bank unless the message includes "جيب" or "بنك" (then also create the matching transaction).



## Extra commands

- /transfer: "حول 2000 للبنك" or "حول 500 للجيب" → moves money between pocket and bank (two linked transactions, not counted as income/expense).

- /undo → deletes the last transaction.

- /edit → shows the last 5 transactions as buttons to delete.

- /month → monthly summary: total income, total expenses, savings.

- /export → sends a CSV file of all transactions.

- /set_pocket 700 and /set_bank 800 → set the starting/correct balance by adding an adjustment transaction of category "تعديل".



## Quality

- Balances are always computed from SUM(transactions) per account, never stored separately.

- Format numbers with thousands separators (e.g. 12 500 دج).

- If a message can't be parsed, reply with one short example of the correct format (no long errors).

- Handle callback_query properly (answerCallbackQuery) so buttons never hang.

- Log errors in a table `bot_logs`.



## Web dashboard (small, optional)

A simple mobile-first RTL page showing balances, last transactions, and a category pie chart for the current month. Read-only.



Build it step by step: first the database and webhook with fast input + balance, then menu and categories, then loans, then the extra commands. لقد ارسلت لك توكن

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://djnani-pocket.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7ff4dbd7-3ed8-4297-9f32-fb55dbd15e54).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
