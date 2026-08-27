import { chatComplete } from '../../ai/aiClient';

export async function generateToolboxTalkNotes(input: {
  title?: string;
  topic?: string;
}): Promise<string> {
  const title = input.title?.trim() ?? '';
  const topic = input.topic?.trim() ?? '';
  if (!title && !topic) {
    throw new Error('Enter a title or topic before generating notes.');
  }

  const { content } = await chatComplete({
    model: undefined,
    temperature: 0.35,
    maxTokens: 1400,
    messages: [
      {
        role: 'system',
        content:
          'You draft concise South African workplace safety toolbox talks for SHEQ teams. ' +
          'Return plain text only (no markdown headings). Structure with short sections: ' +
          'Key points, Discussion notes, and Action items. Keep it practical and under 350 words.'
      },
      {
        role: 'user',
        content: [
          title ? `Title: ${title}` : null,
          topic ? `Topic: ${topic}` : null,
          'Draft the toolbox talk content for a supervisor to deliver on site.'
        ]
          .filter(Boolean)
          .join('\n')
      }
    ]
  });

  if (!content.trim()) {
    throw new Error('AI did not return any content. Please try again.');
  }
  return content.trim();
}
