import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';

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
    const { data, error } = await insforge.database
      .from('support_tickets')
      .insert([{
        company_id: ticket.company_id,
        user_id: ticket.user_id,
        user_email: ticket.user_email,
        category: ticket.category,
        subject: ticket.subject,
        description: ticket.description,
        status: 'open'
      }])
      .select('*')
      .single();

    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to create support ticket');

    return data as SupportTicket;
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
    const { data, error } = await insforge.database
      .from('support_tickets')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(getErrorMessage(error));
    return (data as SupportTicket[]) || [];
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
    const { data, error } = await insforge.database
      .from('support_tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(getErrorMessage(error));
    }

    return (data as SupportTicket) || null;
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
    const { data, error } = await insforge.database
      .from('support_tickets')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', ticketId)
      .select('*')
      .single();

    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to update support ticket');

    return data as SupportTicket;
  } catch (error) {
    console.error('Error updating support ticket:', error);
    return null;
  }
}
