import { forwardDatabaseRoute, getRouteSegment } from '../_forward.js';

const MODULE = 'api.database.rpc';

export default async function handler(req: any, res: any) {
  const functionName = getRouteSegment(req, 'functionName');
  await forwardDatabaseRoute(req, res, MODULE, `/api/database/rpc/${functionName}`);
}
