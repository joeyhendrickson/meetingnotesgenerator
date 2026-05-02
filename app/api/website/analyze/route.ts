import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { chatCompletion } from '@/lib/openai';

export const maxDuration = 300; // 5 minutes (Vercel Hobby plan limit)

async function fetchPageContent(url: string): Promise<{ html: string; text: string } | null> {
  try {
    // Try with https first, then http if needed
    let response;
    let finalUrl = url;
    
    try {
      response = await axios.get(url, {
        timeout: 20000, // Increased timeout
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
        },
        maxRedirects: 10,
        validateStatus: (status) => status < 500, // Accept redirects and client errors
      });
    } catch (httpsError) {
      // Try http if https fails
      if (url.startsWith('https://')) {
        try {
          finalUrl = url.replace('https://', 'http://');
          response = await axios.get(finalUrl, {
            timeout: 20000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            },
            maxRedirects: 10,
            validateStatus: (status) => status < 500,
          });
        } catch (httpError) {
          console.error(`[Fetch] Both HTTPS and HTTP failed for ${url}:`, httpError);
          return null;
        }
      } else {
        console.error(`[Fetch] Error fetching ${url}:`, httpsError);
        return null;
      }
    }

    // Check if we got valid content
    if (!response || !response.data) {
      console.error(`[Fetch] No data received for ${url}`);
      return null;
    }

    const html = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    
    // Extract text content from HTML (simple approach)
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 20000); // Increased limit for deeper analysis

    if (textContent.length < 50) {
      console.warn(`[Fetch] Very little text content extracted from ${url} (${textContent.length} chars)`);
    }

    return { html, text: textContent };
  } catch (error) {
    console.error(`[Fetch] Error fetching ${url}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

// Function to detect outdated Blackboard Learn terminology
function detectOutdatedTerminology(text: string): Array<{ 
  term: string; 
  context: string; 
  severity: 'low' | 'medium' | 'high';
  location?: string;
}> {
  const issues: Array<{ term: string; context: string; severity: 'low' | 'medium' | 'high'; location?: string }> = [];
  
  // Common outdated Blackboard Learn terms
  const outdatedTerms = [
    { pattern: /\bBlackboard Learn\b/gi, severity: 'high' as const },
    { pattern: /\bBb Learn\b/gi, severity: 'high' as const },
    { pattern: /\bLearn\s+\(Blackboard\)\b/gi, severity: 'high' as const },
    { pattern: /\bBlackboard\s+Learn\s+9\.\d+\b/gi, severity: 'high' as const },
    { pattern: /\bclassic\s+Blackboard\b/gi, severity: 'medium' as const },
    { pattern: /\bBlackboard\s+Classic\b/gi, severity: 'medium' as const },
    { pattern: /\bold\s+Blackboard\b/gi, severity: 'medium' as const },
  ];

  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  
  sentences.forEach((sentence, index) => {
    outdatedTerms.forEach(({ pattern, severity }) => {
      if (pattern.test(sentence)) {
        const matches = sentence.match(pattern);
        if (matches) {
          matches.forEach(match => {
            issues.push({
              term: match,
              context: sentence.trim().substring(0, 200),
              severity,
              location: `Sentence ${index + 1}`,
            });
          });
        }
      }
    });
  });

  return issues;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { urls } = body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { success: false, error: 'URLs array is required' },
        { status: 400 }
      );
    }

    if (urls.length > 100) {
      return NextResponse.json(
        { success: false, error: 'Maximum 100 URLs allowed' },
        { status: 400 }
      );
    }

    const results = [];

    for (const url of urls) {
      try {
        console.log(`[Analyze] Processing URL: ${url}`);
        const pageContent = await fetchPageContent(url);

        if (!pageContent) {
          console.error(`[Analyze] Failed to fetch page content for ${url}`);
          results.push({
            url,
            success: false,
            error: 'Failed to fetch page content',
            risks: [],
            summary: 'Unable to analyze - page could not be fetched',
            riskLevel: 'high',
            issues: [],
          });
          continue;
        }

        console.log(`[Analyze] Successfully fetched content for ${url}, text length: ${pageContent.text.length}`);

        // Detect outdated Blackboard Learn terminology
        const outdatedIssues = detectOutdatedTerminology(pageContent.text);
        
        // Detect if this is an instructor-facing page
        const isInstructorPage = /instructor|faculty|teacher|professor|staff|teaching|course\s+setup|how\s+to|tutorial|guide/i.test(pageContent.text);
        const hasLearnFeatures = /grade\s+center|content\s+area|course\s+menu|discussion\s+board|assignment|dropbox|test|quiz|survey/i.test(pageContent.text);

        // Use AI to analyze content for outdated Blackboard Learn messaging
        const analysisPrompt = `You are an expert in Blackboard Ultra migration and content strategy. Analyze the following webpage content to provide comprehensive messaging recommendations.

IMPORTANT CONTEXT:
- Blackboard Learn is the CURRENT system the college uses
- Blackboard Ultra is the NEW system being adopted
- Pages should acknowledge Learn as current while promoting Ultra adoption
- For instructor-facing pages, include links to dev shell access and workshops

Webpage Content (first 18000 characters):
${pageContent.text.substring(0, 18000)}

${outdatedIssues.length > 0 ? `\nDetected Outdated Terms:\n${outdatedIssues.map(i => `- "${i.term}" found in: ${i.context.substring(0, 150)}...`).join('\n')}` : ''}

Base recommendations on the webpage content above and standard Blackboard Ultra migration best practices.

Page Context:
- Instructor-facing: ${isInstructorPage ? 'YES - Include dev shell and workshop links' : 'NO'}
- Mentions Learn features: ${hasLearnFeatures ? 'YES - Needs Ultra feature comparison' : 'NO'}

Your comprehensive analysis should:

1. CURRENT RELEVANCE ASSESSMENT:
   - Is this page still relevant for current Blackboard Learn users?
   - What content is still accurate for Learn?
   - What content needs updating for Learn?

2. FUTURE RELEVANCE ASSESSMENT:
   - Is this page relevant for Blackboard Ultra adoption?
   - What content should be updated to promote Ultra?
   - What content should be removed or archived?

3. MESSAGING STRATEGY:
   - How to acknowledge Learn as current while promoting Ultra
   - Specific wording changes needed
   - Tone and positioning recommendations

4. INSTRUCTOR-SPECIFIC RECOMMENDATIONS (if instructor-facing):
   - Add link to dev shell: www.cs-cc.edu/ultra
   - Mention workshops and training
   - Highlight Ultra features that improve student learning
   - Provide transition guidance

5. SPECIFIC CHANGES:
   - Exact text to replace
   - New text to add
   - Sections to remove or update
   - Links to add

Provide a JSON response with this structure:
{
  "risks": ["specific issue 1 with context", "specific issue 2 with context", ...],
  "summary": "Comprehensive summary of current relevance, future relevance, and required changes",
  "riskLevel": "low" | "medium" | "high",
  "currentRelevance": {
    "isRelevant": true | false,
    "reason": "Why this page is or isn't relevant for current Learn users",
    "accurateContent": ["list of content that's still accurate"],
    "needsUpdating": ["list of content that needs updating for Learn"]
  },
  "futureRelevance": {
    "isRelevant": true | false,
    "reason": "Why this page is or isn't relevant for Ultra adoption",
    "shouldUpdate": true | false,
    "shouldArchive": true | false,
    "reasoning": "Explanation of update vs archive decision"
  },
  "messagingStrategy": {
    "currentState": "How to acknowledge Learn as current system",
    "transitionMessage": "How to promote Ultra adoption",
    "tone": "Recommended tone and positioning",
    "keyMessages": ["key message 1", "key message 2", ...]
  },
  "issues": [
    {
      "type": "Outdated Terminology" | "Feature Reference" | "Workflow Reference" | "Instructional Content" | "Missing Ultra Link" | "Messaging Update",
      "description": "Detailed description of what needs changing and why",
      "currentText": "The exact current text found",
      "suggestedReplacement": "Specific suggested replacement text",
      "reasoning": "Why this change is needed",
      "location": "Where in the content (section, paragraph, etc.)",
      "severity": "low" | "medium" | "high",
      "priority": "immediate" | "high" | "medium" | "low"
    }
  ],
  "instructorRecommendations": ${isInstructorPage ? `{
    "addDevShellLink": true,
    "devShellLinkText": "Suggested text for dev shell link",
    "workshopMention": "Suggested text mentioning workshops",
    "ultraFeaturesToHighlight": ["feature 1", "feature 2", ...],
    "transitionGuidance": "Suggested guidance for instructors transitioning to Ultra"
  }` : 'null'},
  "outdatedTermsFound": ["list of outdated terms found"],
  "updatePriority": "high" | "medium" | "low",
  "specificChanges": [
    {
      "action": "replace" | "add" | "remove" | "update",
      "currentText": "Exact text to change",
      "newText": "New text",
      "location": "Where to make change",
      "reason": "Why this change is needed"
    }
  ]
}

Only return valid JSON, no other text.`;

        // Get AI analysis
        let analysis;
        try {
          console.log(`[Analyze] Starting AI analysis for ${url}`);
          const analysisResponse = await chatCompletion(
            [
              {
                role: 'user',
                content: analysisPrompt,
              },
            ],
            undefined,
            { temperature: 0.3 }
          );

          console.log(`[Analyze] AI response received, length: ${analysisResponse.length}`);

          // Parse AI response
          try {
            const jsonMatch = analysisResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              analysis = JSON.parse(jsonMatch[0]);
              console.log(`[Analyze] Successfully parsed JSON response`);
            } else {
              console.error(`[Analyze] No JSON found in response. Response preview: ${analysisResponse.substring(0, 200)}`);
              throw new Error('No JSON found in response');
            }
          } catch (parseError) {
            console.error(`[Analyze] Error parsing analysis response:`, parseError);
            console.error(`[Analyze] Response was: ${analysisResponse.substring(0, 500)}`);
            throw parseError;
          }
        } catch (aiError) {
          console.error(`[Analyze] Error during AI analysis for ${url}:`, aiError);
          // Fallback to pattern-based analysis
          analysis = {
            risks: outdatedIssues.length > 0 
              ? [`Found ${outdatedIssues.length} instance(s) of outdated Blackboard Learn terminology`]
              : ['No obvious outdated terminology detected'],
            summary: outdatedIssues.length > 0 
              ? `Found ${outdatedIssues.length} instance(s) of outdated Blackboard Learn terminology that should be updated to Blackboard Ultra.`
              : 'No obvious outdated messaging detected.',
            riskLevel: outdatedIssues.length > 0 ? 'high' : 'low',
            issues: outdatedIssues.map(i => ({
              type: 'Outdated Terminology',
              description: `Found outdated term: ${i.term}`,
              outdatedText: i.term,
              suggestedReplacement: 'Blackboard Ultra',
              location: i.location,
              severity: i.severity,
            })),
            outdatedTermsFound: outdatedIssues.map(i => i.term),
            updatePriority: outdatedIssues.length > 0 ? 'high' : 'low',
          };
        }

        // Combine detected issues with AI analysis
        const allIssues = [
          ...(analysis.issues || []),
          ...outdatedIssues.map(i => ({
            type: 'Outdated Terminology',
            description: `Found outdated term: ${i.term}. This should be updated to acknowledge Learn as current while promoting Ultra adoption.`,
            currentText: i.term,
            outdatedText: i.term,
            suggestedReplacement: 'Blackboard Ultra (or appropriate messaging acknowledging Learn as current)',
            reasoning: 'Terminology needs to reflect that Learn is current but Ultra is the future direction',
            location: i.location,
            severity: i.severity,
            priority: i.severity === 'high' ? 'high' : 'medium',
          })),
        ];

        // Remove duplicates
        const uniqueIssues = allIssues.filter((issue, index, self) =>
          index === self.findIndex((i) => 
            (i.currentText || i.outdatedText) === (issue.currentText || issue.outdatedText) && 
            i.location === issue.location
          )
        );

        const allRisks = [
          ...(analysis.risks || []),
          ...uniqueIssues.map(i => i.description || `${i.type}: ${i.description}`),
        ];

        // Determine overall risk level - prioritize high-severity issues
        const highSeverityIssues = uniqueIssues.filter(i => i.severity === 'high').length;
        const mediumSeverityIssues = uniqueIssues.filter(i => i.severity === 'medium').length;
        const highPriorityIssues = uniqueIssues.filter(i => i.priority === 'immediate' || i.priority === 'high').length;
        
        let overallRiskLevel = analysis.riskLevel || (outdatedIssues.length > 0 ? 'high' : 'low');
        if (highSeverityIssues > 0 || highPriorityIssues > 0 || allRisks.length > 5) {
          overallRiskLevel = 'high';
        } else if (mediumSeverityIssues > 0 || allRisks.length > 2) {
          overallRiskLevel = 'medium';
        }

        // Build comprehensive summary
        let comprehensiveSummary = analysis.summary || '';
        if (analysis.currentRelevance) {
          comprehensiveSummary += `\n\nCURRENT RELEVANCE: ${analysis.currentRelevance.isRelevant ? 'Relevant' : 'Not relevant'} - ${analysis.currentRelevance.reason}`;
        }
        if (analysis.futureRelevance) {
          comprehensiveSummary += `\n\nFUTURE RELEVANCE: ${analysis.futureRelevance.isRelevant ? 'Relevant' : 'Not relevant'} - ${analysis.futureRelevance.reasoning || analysis.futureRelevance.reason}`;
        }
        if (analysis.messagingStrategy) {
          comprehensiveSummary += `\n\nMESSAGING STRATEGY: ${analysis.messagingStrategy.transitionMessage || 'See detailed recommendations'}`;
        }

        results.push({
          url,
          success: true,
          risks: allRisks,
          summary: comprehensiveSummary || (outdatedIssues.length > 0 
            ? `Found ${outdatedIssues.length} instances of Blackboard Learn references. Needs messaging update to acknowledge Learn as current while promoting Ultra adoption.`
            : 'No obvious outdated messaging detected.'),
          riskLevel: overallRiskLevel,
          issues: uniqueIssues,
          outdatedTermsFound: analysis.outdatedTermsFound || outdatedIssues.map(i => i.term),
          updatePriority: analysis.updatePriority || overallRiskLevel,
          currentRelevance: analysis.currentRelevance,
          futureRelevance: analysis.futureRelevance,
          messagingStrategy: analysis.messagingStrategy,
          instructorRecommendations: analysis.instructorRecommendations,
          specificChanges: analysis.specificChanges || [],
        });
      } catch (error) {
        console.error(`[Analyze] Error analyzing ${url}:`, error);
        console.error(`[Analyze] Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
        results.push({
          url,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          risks: [`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
          summary: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          riskLevel: 'high',
          issues: [],
        });
      }
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('[Analyze] Website analysis error:', error);
    console.error('[Analyze] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze websites',
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
