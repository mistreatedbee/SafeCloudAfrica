import { forwardDatabaseRoute, getRouteSegment } from '../server/databaseProxy.js';

const MODULE = 'api.database-records';

export default async function handler(req: any, res: any) {
  const path = getRouteSegment(req, 'path');
  await forwardDatabaseRoute(req, res, MODULE, `/api/database/records/${path}`);
}
