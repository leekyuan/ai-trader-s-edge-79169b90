import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = claimsData.claims.sub;

    const body = await req.json();
    const { pair, period_days, params } = body;

    if (!pair || !period_days) {
      return new Response(JSON.stringify({ error: 'Missing pair or period_days' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch klines from Binance
    const symbol = `${pair.toUpperCase()}USDT`;
    const limit1H = Math.min(period_days * 24, 1000);
    const limit15M = Math.min(period_days * 24 * 4, 1000);

    const [res1H, res15M] = await Promise.all([
      fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=${limit1H}`),
      fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&limit=${limit15M}`),
    ]);

    const klines1H = await res1H.json();
    const klines15M = await res15M.json();

    return new Response(JSON.stringify({
      ok: true,
      klines1H_count: klines1H.length,
      klines15M_count: klines15M.length,
      message: 'Backtest data fetched. Processing happens client-side.',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
