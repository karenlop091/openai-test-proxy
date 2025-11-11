export default function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const name = url.searchParams.get('name') || 'Unknown';

  res.status(200).json({
    key: Math.random().toString(36).substring(2, 10) + '-' + Math.random().toString(36).substring(2, 10),
    expiresInHours: 170,
    tokensLeft: 15000,
    name
  });
}
