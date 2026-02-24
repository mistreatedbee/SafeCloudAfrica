import React from 'react';
import { Navigate } from 'react-router-dom';

export function EnvironmentPage() {
  return <Navigate to="/dashboard/environment" replace />;
}
