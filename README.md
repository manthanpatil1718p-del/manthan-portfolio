# Manthan Patil — Portfolio

## Run
    node server.js            # opens at http://localhost:3000
    # optional email alerts:
    npm install
    cp .env.example .env      # fill SMTP_PASS (Gmail App Password)

## What the contact form does
Clicking **Send message** opens your WhatsApp chat (+91 85918 95823) with the enquiry pre-filled,
and also saves it to `data/messages.jsonl` (and emails you if SMTP is set).
View saved enquiries: `GET /api/messages` with header `Authorization: Bearer <ADMIN_TOKEN>`.

## Deploy
Any Node host (Render, Railway, a VPS) — start command `node server.js`. Keep `public/videos` with the project.
