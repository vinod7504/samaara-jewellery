# Samaara Jewellery

## Render deployment

Deploy the repository as a Render Web Service with the Root Directory left blank.

- Build Command: `npm run build`
- Start Command: `npm start`
- Environment variable: `MONGODB_URI`
- Optional environment variable: `MONGODB_DB` (defaults to `samaara`)

The root build script installs and builds the Vite frontend, then installs the
production backend dependencies. Express serves both the API and the compiled
frontend from one service.
