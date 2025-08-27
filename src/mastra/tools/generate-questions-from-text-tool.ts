import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const MAX_TEXT_LENGTH = 4000;

export const generateQuestionsFromTextTool = createTool({
  id: 'generate-questions-from-text-tool',
  description: 'Generates comprehensive questions from text content',
  inputSchema: z.object({
    extractedText: z.string().describe('The extracted text to generate questions from'),
    maxQuestions: z.number().optional().describe('Maximum number of questions to generate (default: 10)'),
  }),
  outputSchema: z.object({
    questions: z.array(z.string()).describe('Array of generated questions'),
    questionCount: z.number().describe('Number of questions generated'),
    success: z.boolean().describe('Whether question generation was successful'),
  }),
  execute: async ({ context, mastra }) => {
    const { extractedText, maxQuestions = 10 } = context;

    console.log('❓ Generating questions from extracted text...');

    if (!extractedText || extractedText.trim() === '') {
      console.error('❌ No extracted text provided for question generation');
      return {
        questions: [],
        questionCount: 0,
        success: false,
      };
    }

    // Simple check for very large documents
    if (extractedText.length > MAX_TEXT_LENGTH) {
      console.warn('⚠️ Document is very large. Consider using a smaller PDF to avoid token limits.');
      console.warn(`⚠️ Using first ${MAX_TEXT_LENGTH} characters only...`);
    }

    try {
      const agent = mastra?.getAgent('textQuestionAgent');
      if (!agent) {
        throw new Error('Question generator agent not found');
      }

      const streamResponse = await agent.stream([
        {
          role: 'user',
          content: `Generate comprehensive questions based on the following content extracted from a PDF.
Please create questions that test understanding, analysis, and application of the content.
Generate up to ${maxQuestions} questions:

${extractedText.substring(0, MAX_TEXT_LENGTH)}`,
        },
      ]);

      let generatedContent = '';

      for await (const chunk of streamResponse.textStream) {
        generatedContent += chunk || '';
      }

      if (generatedContent.trim().length > 20) {
        // Parse the questions from the generated content
        const questions = parseQuestionsFromText(generatedContent, maxQuestions);

        console.log(`✅ Question generation successful: ${questions.length} questions generated`);

        return {
          questions,
          questionCount: questions.length,
          success: true,
        };
      } else {
        console.warn('⚠️ Generated content too short for question parsing');
        return {
          questions: [],
          questionCount: 0,
          success: false,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Question generation failed:', errorMessage);

      // Check if it's a token limit error
      if (errorMessage.includes('context length') || errorMessage.includes('token')) {
        console.error('💡 Tip: Try using a smaller PDF file. Large documents exceed the token limit.');
      }

      return {
        questions: [],
        questionCount: 0,
        success: false,
      };
    }
  },
});

// Helper function to parse questions from generated text
function parseQuestionsFromText(text: string, maxQuestions: number): string[] {
  // Some LLMs return multiple numbered questions on a single line.
  // Ensure numbered items always start on a new line so we can split reliably.
  const normalised = text.replace(/(\d+[\.\)]\s*)/g, '\n$1');

  // Break into potential question segments, splitting on newlines and question marks
  const segments = normalised
    .split('\n')
    .flatMap(line =>
      line
        .split('?')
        .map(part => part.trim())
        .filter(part => part.length > 0)
        .map(part => part + '?'),
    );

  // Clean up numbering/bullets and filter out short strings
  const questions = segments
    .map(segment => {
      let cleaned = segment.replace(/^\d+[\.\)]\s*/, '');
      cleaned = cleaned.replace(/^[\-\*\•]\s*/, '');
      return cleaned.trim();
    })
    .filter(q => q.length > 5 && q.includes('?'))
    .slice(0, maxQuestions);

  return questions;
}
