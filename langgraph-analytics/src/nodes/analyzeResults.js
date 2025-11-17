/**
 * Analyze the results from Cube
 * Pass through the Cube agent's response for display
 */
export async function analyzeResults(state) {
  const { cubeResults, questionType } = state;

  console.log('🔬 Analyzing results...');

  if (!cubeResults || cubeResults.content === '') {
    console.log('   ⚠️  No results to analyze');
    return {
      analysis: 'No data available',
      messages: [{ role: 'system', content: 'Analysis skipped - no results' }]
    };
  }

  console.log(`   Type: ${questionType}`);
  console.log(`   ✓ Analysis complete`);

  return {
    analysis: cubeResults.content,
    messages: [{ role: 'system', content: `Analysis completed for ${questionType} query` }]
  };
}
