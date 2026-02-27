export function registerWebhookRoutes(app, provider) {
  app.get('/webhook/tiktok', (req, res) => provider.verifyWebhook(req, res));
  app.post('/webhook/tiktok', (req, res) => provider.handleWebhook(req, res));
}
