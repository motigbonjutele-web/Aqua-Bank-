# Render free-tier deployment notes

This Blueprint sets both the Node web service and PostgreSQL database to Render's Free compute plans to avoid selecting paid compute resources during initial testing.

Important limitations: Render Free web services spin down after 15 minutes without inbound traffic and can take about a minute to wake. Render Free Postgres databases are limited to 1 GB and expire 30 days after creation; after expiration there is a 14-day grace period to upgrade before the database and its data are deleted. Free Postgres does not include backups. Do not use this setup for production or important personal/financial records.

If Render still shows a payment-method or billing prompt, stop and inspect the exact service plan and workspace billing screen before confirming anything. Do not approve a paid plan unless you intentionally want it.
