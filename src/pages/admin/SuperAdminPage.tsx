import React from 'react';
import { Layout } from '../../components/layout/Layout';
import { SuperAdminOrganisationsPage } from './superadmin/SuperAdminOrganisationsPage';

export function SuperAdminPage() {
  return (
    <Layout title="Super Admin">
      <SuperAdminOrganisationsPage />
    </Layout>
  );
}
