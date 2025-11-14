/**
 * Classify the user's question to determine the analysis type
 * This helps route the workflow and provides context for subsequent nodes
 */
export async function classifyQuestion(state) {
  const { userQuestion, messages } = state;

  console.log('🔍 Classifying question...');

  let questionType = 'exploration';
  const lowerQuestion = userQuestion.toLowerCase();

  // Simple classification based on keywords
  if (lowerQuestion.includes('compare') || lowerQuestion.includes('vs') || lowerQuestion.includes('versus')) {
    questionType = 'comparison';
  } else if (lowerQuestion.includes('report') || lowerQuestion.includes('summary') || lowerQuestion.includes('overview')) {
    questionType = 'reporting';
  } else if (lowerQuestion.includes('trend') || lowerQuestion.includes('over time') || lowerQuestion.includes('growth')) {
    questionType = 'exploration';
  }

  console.log(`   Type: ${questionType}`);

  return {
    questionType,
    messages: [{ role: 'system', content: `Question classified as: ${questionType}` }]
  };
}
