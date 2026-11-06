# Aqua Bank Personal Dashboard — Render-ready prototype

> **Demo only:** This is an independent software prototype, not a licensed bank or payment service. It does not access real bank systems or accounts. Do not enter real banking credentials or store real financial information in this demo.

## GitHub upload

This ZIP is arranged with the project files at its top level. To create the GitHub repository:

1. Create a new, empty repository on GitHub.
2. Extract this ZIP on your computer.
3. Open the extracted project folder, select **all its contents** (including the `public` folder and the hidden `.env.example` file), and upload those contents to the repository root. Do not create another enclosing project folder inside the repository.
4. Confirm that `server.js`, `package.json`, `render.yaml`, and `schema.sql` are visible at the top level, and that `public/index.html` exists.
5. Commit the files.

Expected repository layout:

```text
repository-root/
├── .env.example
├── .gitignore
├── README.md
├── RENDER_FREE_TIER_NOTES.md
├── package.json
├── render.yaml
├── schema.sql
├── server.js
└── public/
    ├── index.html
    ├── app.js
    └── styles.css
```

## Deploy on Render

1. In Render, choose **New → Blueprint** and connect the GitHub repository.
2. Render reads `render.yaml` to configure the Node web service and PostgreSQL database.
3. Carefully review the plan and any charges shown in Render before approving. The included Blueprint requests Render's Free plans; availability and terms can change.
4. Render supplies `DATABASE_URL` and generates `JWT_SECRET` and `ADMIN_API_KEY`. The server applies `schema.sql` automatically at startup.
5. When the service is live, open its `onrender.com` URL. Check `/api/health` if the service does not become healthy.

The web server serves both the frontend and API from the same origin. The frontend must remain in the top-level `public/` directory.

## Important: GitHub Pages is not the application host

GitHub Pages only hosts static files; it cannot run this Node.js backend or connect directly to PostgreSQL. Use GitHub as the source repository and Render's web-service URL as the working application URL.

## Included features

- Registration and login backed by PostgreSQL; passwords are stored as bcrypt hashes.
- HttpOnly session cookies, rate limiting, and user-scoped account queries.
- Database tables for users, USD accounts, transactions, and incoming payment records.
- Render Blueprint for the Node web service and PostgreSQL database.
- Automatic, idempotent database schema setup during server startup.
- Responsive interface with mobile navigation and light/dark appearance.

New registrations receive an Everyday Checking account with a zero balance. No real funds are created or represented as available. Sample figures in the visual design are illustrative only.

## Local development

Requires Node.js 20+ and PostgreSQL. Copy `.env.example` to `.env`, set `DATABASE_URL` and a strong `JWT_SECRET` (at least 32 characters in production), then run:

```bash
npm install
npm start
```

The database schema is applied automatically on startup. Never commit `.env` or real secrets to GitHub.

## Payments and transfers

Real transfers are **not enabled**. The transfer endpoint intentionally returns HTTP 503 until an authorized payment provider, contractual authorization, identity/compliance checks, signed webhooks, reconciliation, fraud controls, and a reviewed integration are implemented. Changing an environment variable alone will not enable money movement. Keep `ADMIN_API_KEY` private and never place it in browser code. Only import incoming payment records after confirmation from a trusted provider.

## Before real-world use

This is a prototype starter, not production banking software. A production deployment would require independent security review, email verification, password reset, MFA, audit logging, administrator access controls, monitoring, backups, and jurisdiction-appropriate legal and compliance controls. Do not use the included free-tier database for important or real financial records.
