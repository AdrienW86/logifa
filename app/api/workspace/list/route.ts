import { requireAdmin } from '@/lib/auth/require-admin';
import { workspacePage } from '@/lib/services/workspace-page';
import { pageInput } from '@/lib/workspace/pagination';
import { privateJson, errorResponse } from '@/lib/workspace/http';
export async function GET(request: Request) {
  try {
    await requireAdmin(); const query = new URL(request.url).searchParams;
    return privateJson(await workspacePage(query.get('issuer')??'',pageInput(query)));
  } catch(error) {return errorResponse(error);}
}
