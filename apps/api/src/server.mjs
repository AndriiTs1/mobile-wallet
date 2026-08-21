import { createServer } from 'node:http';

const PORT = readPort(process.env.PORT);
const ZERO_X_API_KEY = process.env.ZERO_X_API_KEY;

const ZERO_X_BASE_URL = 'https://api.0x.org';
const ZERO_X_PRICE_PATH = '/swap/allowance-holder/price';
const ZERO_X_QUOTE_PATH = '/swap/allowance-holder/quote';
const REQUEST_TIMEOUT_MS = 8_000;

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const ATOMIC_AMOUNT_PATTERN = /^[0-9]+$/;

function readPort(value) {
  if (value === undefined) return 3000;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  return parsed;
}

function sendJson(response, statusCode, body) {
  const payload = JSON.stringify(body);

  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store'
  });

  response.end(payload);
}

function readRequiredQuery(searchParams, name) {
  const values = searchParams.getAll(name);

  if (values.length !== 1 || values[0].length === 0) {
    return null;
  }

  return values[0];
}

function validatePriceRequest(url) {
  const chainId = readRequiredQuery(url.searchParams, 'chainId');
  const sellToken = readRequiredQuery(url.searchParams, 'sellToken');
  const buyToken = readRequiredQuery(url.searchParams, 'buyToken');
  const sellAmount = readRequiredQuery(url.searchParams, 'sellAmount');
  const taker = readRequiredQuery(url.searchParams, 'taker');

  if (chainId !== '1') {
    return { ok: false };
  }

  if (
    sellToken === null ||
    buyToken === null ||
    !ADDRESS_PATTERN.test(sellToken) ||
    !ADDRESS_PATTERN.test(buyToken)
  ) {
    return { ok: false };
  }

  if (
    sellAmount === null ||
    !ATOMIC_AMOUNT_PATTERN.test(sellAmount) ||
    BigInt(sellAmount) <= 0n
  ) {
    return { ok: false };
  }

  if (taker === null || !ADDRESS_PATTERN.test(taker)) {
    return { ok: false };
  }

  return {
    ok: true,
    query: {
      chainId,
      sellToken,
      buyToken,
      sellAmount,
      taker
    }
  };
}

function buildZeroXSwapUrl(path, query) {
  const params = new URLSearchParams();

  params.set('chainId', query.chainId);
  params.set('sellToken', query.sellToken);
  params.set('buyToken', query.buyToken);
  params.set('sellAmount', query.sellAmount);
  params.set('taker', query.taker);

  return `${ZERO_X_BASE_URL}${path}?${params.toString()}`;
}

function buildZeroXPriceUrl(query) {
  return buildZeroXSwapUrl(ZERO_X_PRICE_PATH, query);
}

function buildZeroXQuoteUrl(query) {
  return buildZeroXSwapUrl(ZERO_X_QUOTE_PATH, query);
}

async function handleSwapPrice(request, response, url) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    sendJson(response, 405, { error: 'method_not_allowed' });
    return;
  }

  const validated = validatePriceRequest(url);

  if (!validated.ok) {
    sendJson(response, 400, { error: 'invalid_request' });
    return;
  }

  if (!ZERO_X_API_KEY) {
    sendJson(response, 503, { error: 'service_unavailable' });
    return;
  }

  let upstream;

  try {
    upstream = await fetch(
      buildZeroXPriceUrl(validated.query),
      {
        method: 'GET',
        headers: {
          '0x-api-key': ZERO_X_API_KEY,
          '0x-version': 'v2',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      }
    );
  } catch {
    sendJson(response, 502, { error: 'upstream_unavailable' });
    return;
  }

  if (!upstream.ok) {
    // Never forward the provider's raw error body to the client.
    sendJson(response, 502, { error: 'upstream_rejected' });
    return;
  }

  let payload;

  try {
    payload = await upstream.json();
  } catch {
    sendJson(response, 502, { error: 'upstream_malformed' });
    return;
  }

  sendJson(response, 200, payload);
}

async function handleSwapQuote(request, response, url) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    sendJson(response, 405, { error: 'method_not_allowed' });
    return;
  }

  const validated = validatePriceRequest(url);

  if (!validated.ok) {
    sendJson(response, 400, { error: 'invalid_request' });
    return;
  }

  if (!ZERO_X_API_KEY) {
    sendJson(response, 503, { error: 'service_unavailable' });
    return;
  }

  let upstream;

  try {
    upstream = await fetch(
      buildZeroXQuoteUrl(validated.query),
      {
        method: 'GET',
        headers: {
          '0x-api-key': ZERO_X_API_KEY,
          '0x-version': 'v2',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      }
    );
  } catch {
    sendJson(response, 502, { error: 'upstream_unavailable' });
    return;
  }

  if (!upstream.ok) {
    sendJson(response, 502, { error: 'upstream_rejected' });
    return;
  }

  let payload;

  try {
    payload = await upstream.json();
  } catch {
    sendJson(response, 502, { error: 'upstream_malformed' });
    return;
  }

  sendJson(response, 200, payload);
}

const server = createServer(async (request, response) => {
  const host = request.headers.host ?? 'localhost';

  let url;
  try {
    url = new URL(request.url ?? '/', `http://${host}`);
  } catch {
    sendJson(response, 400, { error: 'invalid_request' });
    return;
  }

  if (url.pathname === '/health') {
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      sendJson(response, 405, { error: 'method_not_allowed' });
      return;
    }

    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (url.pathname === '/v1/swap/price') {
    await handleSwapPrice(request, response, url);
    return;
  }

  if (url.pathname === '/v1/swap/quote') {
    await handleSwapQuote(request, response, url);
    return;
  }

  sendJson(response, 404, { error: 'not_found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SwissWallet API listening on port ${PORT}`);
});
