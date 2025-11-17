/**
 * Generate insights from the Cube agent response
 * Extract metadata about the query execution
 */
export async function generateInsights(state) {
  const { cubeResults, analysis, questionType } = state;

  console.log('💡 Generating insights...');

  if (!cubeResults || !analysis) {
    console.log('   ⚠️  Insufficient data for insights');
    return {
      insights: [],
      messages: [{ role: 'system', content: 'Insight generation skipped' }]
    };
  }

  const insights = [];

  // Extract real metadata from Cube agent response
  if (cubeResults.toolCalls && cubeResults.toolCalls.length > 0) {
    const toolNames = cubeResults.toolCalls.map(t => t.name).filter(Boolean);
    if (toolNames.length > 0) {
      insights.push(`Agent used tools: ${toolNames.join(', ')}`);
    }
  }

  if (cubeResults.thinking && cubeResults.thinking.length > 0) {
    insights.push(`Agent performed ${cubeResults.thinking.length} reasoning step(s)`);
  }

  console.log(`   ✓ Generated ${insights.length} insight(s)`);
  insights.forEach((insight, i) => {
    console.log(`   ${i + 1}. ${insight}`);
  });

  return {
    insights,
    messages: [{ role: 'system', content: `Generated ${insights.length} insights` }]
  };
}
