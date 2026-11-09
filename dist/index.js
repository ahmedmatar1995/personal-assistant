import { serve } from '@hono/node-server';
import { Hono } from 'hono';
const app = new Hono();
app.get('/', (c) => {
    return c.text('Hello Hono!');
});
// Start a local server only when not running on Vercel (Vercel serves the app
// via its Hono serverless preset, which imports the default export below).
if (!process.env.VERCEL) {
    serve({
        fetch: app.fetch,
        port: Number(process.env.PORT) || 3000
    }, (info) => {
        console.log(`Server is running on http://localhost:${info.port}`);
    });
}
export default app;
