import { requireAdmin } from '@/lib/auth/require-admin';
import { paymentAllocations } from '@/lib/services/payment-allocations';
import { privateJson,errorResponse } from '@/lib/workspace/http';
export async function GET(request: Request, {params}: {params: Promise<{id:string}>}) {
  try {
    await requireAdmin();
    return privateJson(await paymentAllocations((await params).id,new URL(request.url).searchParams.get('issuer')??''));
  } catch(error) {return errorResponse(error);}
}
