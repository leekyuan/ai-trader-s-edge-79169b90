import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { type, message, symbol, data: signalData } = body;

    // Get user's telegram settings
    const { data: settings, error: settingsError } = await supabase
      .from('user_telegram_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (settingsError || !settings) {
      return new Response(JSON.stringify({ error: '텔레그램 설정을 먼저 구성해주세요' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check notification preferences
    if (type === 'strong_signal' && !settings.notify_strong_signal) {
      return new Response(JSON.stringify({ skipped: true, reason: '강력 신호 알림 비활성화' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (type === 'tp_reached' && !settings.notify_tp_reached) {
      return new Response(JSON.stringify({ skipped: true, reason: 'TP 도달 알림 비활성화' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (type === 'pattern_complete' && !settings.notify_pattern_complete) {
      return new Response(JSON.stringify({ skipped: true, reason: '패턴 완성 알림 비활성화' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Decode bot token
    const botToken = atob(settings.bot_token);
    const chatId = settings.chat_id;

    // Format message
    let text = message;
    if (!text) {
      switch (type) {
        case 'strong_signal':
          text = `🔥 *강력 신호 발생*\n\n코인: ${symbol}\n${signalData?.direction === 'long' ? '📈 롱' : '📉 숏'}\n진입가: ${signalData?.entry}\n목표가: ${signalData?.tp}\n손절가: ${signalData?.sl}`;
          break;
        case 'tp_reached':
          text = `🎯 *TP 도달!*\n\n코인: ${symbol}\n목표가 ${signalData?.tp} 도달\n수익률: +${signalData?.pnl}%`;
          break;
        case 'pattern_complete':
          text = `📊 *패턴 완성*\n\n코인: ${symbol}\n패턴: ${signalData?.pattern}\n방향: ${signalData?.direction}`;
          break;
        default:
          text = message || '📢 CryptoEdge AI 알림';
      }
    }

    // Send via Telegram Bot API
    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
        }),
      }
    );

    const telegramResult = await telegramResponse.json();

    if (!telegramResponse.ok) {
      return new Response(JSON.stringify({ error: '텔레그램 전송 실패', details: telegramResult }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, message_id: telegramResult.result?.message_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
