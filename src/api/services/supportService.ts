import { insforge } from '../insforge/client';

export interface SupportTicket {
  id?: string;
  company_id?: string;
  user_id?: string;
  user_email?: string;
  category: 'bug' | 'access' | 'billing' | 'feature-request' | 'other';
  subject: string;
  description: string;
  status?: 'open' | 'in-progress' | 'closed';
  created_at?: string;
  updated_at?: string;
}

/**
 * Create a support ticket
 */
export async function createSupportTicket(ticket: SupportTicket): Promise<SupportTicket> {
  try {
    const response = await insforge.post('/support_tickets', {
      company_id: ticket.company_id,
      user_id: ticket.user_id,
      user_email: ticket.user_email,
      category: ticket.category,
      subject: ticket.subject,
      description: ticket.description,
      status: 'open'
    });

    if (!response.ok) {
      throw new Error(`Failed to create support ticket: ${response.statusText}`);
    }

    return response.data as SupportTicket;
  } catch (error) {
    console.error('Error creating support ticket:', error);
    throw error;
  }
}

/**
 * List support tickets for a company
 */
export async function listSupportTickets(
  companyId: string,
  limit = 50
): Promise<SupportTicket[]> {
  try {
    const response = await insforge.get('/support_tickets', {
      params: {
        company_id: `eq.${companyId}`,
        limit,
        order: 'created_at.desc'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to list support tickets: ${response.statusText}`);
    }

    return (response.data as SupportTicket[]) || [];
  } catch (error) {
    console.error('Error listing support tickets:', error);
    return [];
  }
}

/**
 * Get a specific support ticket
 */
export async function getSupportTicket(ticketId: string): Promise<SupportTicket | null> {
  try {
    const response = await insforge.get(`/support_tickets/${ticketId}`);

    if (!response.ok) {
      throw new Error(`Failed to get support ticket: ${response.statusText}`);
    }

    return (response.data as SupportTicket) || null;
  } catch (error) {
    console.error('Error getting support ticket:', error);
    return null;
  }
}

/**
 * Update a support ticket status
 */
export async function updateSupportTicketStatus(
  ticketId: string,
  status: 'open' | 'in-progress' | 'closed'
): Promise<SupportTicket | null> {
  try {
    const response = await insforge.patch(`/support_tickets/${ticketId}`, {
      status
    });

    if (!response.ok) {
      throw new Error(`Failed to update support ticket: ${response.statusText}`);
    }

    return (response.data as SupportTicket) || null;
  } catch (error) {
    console.error('Error updating support ticket:', error);
    return null;
  }
}
