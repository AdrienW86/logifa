import 'server-only';
import { databaseForAdmin } from '../supabase/server';
import { checkedRpc } from '../services/billing';
export async function consumeAgentRequest(operation: 'proposal' | 'pdf_extraction') {
  const result = await checkedRpc(await databaseForAdmin(), 'logifa_consume_agent_request', { p_operation: operation });
  if (result.allowed !== true) throw new Error('LOGIFA_AGENT_RATE_LIMIT');
}
