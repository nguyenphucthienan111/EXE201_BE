const { GoogleGenerativeAI } = require("@google/generative-ai");

// Load environment variables
require("dotenv").config();

// Initialize Gemini AI
let genAI;
let model;

try {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn(
      "⚠️ GEMINI_API_KEY is missing. AI features will throw errors until it is set."
    );
  } else {
    genAI = new GoogleGenerativeAI(apiKey);
    model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    console.log(
      "✅ Google Gemini AI initialized with provided GEMINI_API_KEY."
    );
  }
} catch (error) {
  console.error("❌ Gemini AI initialization error:", error.message);
}

/**
 * Generate writing prompts for mental health journaling
 * @param {string} mood - Current user mood
 * @param {string} topic - Optional topic (gratitude, reflection, etc.)
 * @param {boolean} isPremium - Whether user has premium
 * @returns {Promise<Array>} Array of writing suggestions
 */
const generateWritingPrompts = async (
  mood = "",
  topic = "",
  isPremium = false
) => {
  try {
    if (!model) {
      throw new Error("AI model not available - GEMINI_API_KEY required");
    }

    // Detect user language preference (default to Vietnamese for Vietnamese users)
    const userLanguage = detectUserLanguage();

    // Construct AI prompt
    const aiPrompt = `Generate ${
      isPremium ? "10" : "3"
    } thoughtful, gentle writing prompts for mental health journaling.
    
Context:
- User's current mood: ${mood || "not specified"}
- Topic focus: ${topic || "general reflection"}
- Tone: Supportive, non-judgmental, encouraging
- Language: ${userLanguage === "vi" ? "Vietnamese (Tiếng Việt)" : "English"}
- Target: Personal emotional processing and self-reflection

Requirements:
- Each prompt should be 1-2 sentences
- Focus on emotional well-being and self-discovery
- Avoid triggering or negative language
- Encourage positive introspection
- Be specific and actionable
- ${
      userLanguage === "vi"
        ? "Use Vietnamese language naturally and culturally appropriate"
        : "Use English language naturally"
    }

Return as a JSON array of strings: ["prompt1", "prompt2", ...]`;

    const result = await model.generateContent(aiPrompt);
    const response = await result.response;
    const text = response.text();

    // Try to parse JSON response
    try {
      const suggestions = JSON.parse(text);
      if (Array.isArray(suggestions)) {
        const aiResult = suggestions.slice(0, isPremium ? 10 : 3);
        console.log(
          `🤖 AI returned ${aiResult.length} suggestions for ${
            isPremium ? "premium" : "free"
          } user`
        );
        return aiResult;
      }
    } catch (parseError) {
      console.warn("⚠️ AI response not valid JSON, parsing manually");
    }

    // Manual parse as a minimal fallback for non-JSON AI responses
    const lines = text
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => line.replace(/^[\d\-\*\.\s]+/, "").trim())
      .filter((line) => line.length > 10);

    const manualResult = lines.slice(0, isPremium ? 10 : 3);
    console.log(
      `📝 Manual parsing returned ${manualResult.length} suggestions for ${
        isPremium ? "premium" : "free"
      } user`
    );
    return manualResult;
  } catch (error) {
    console.error("❌ Error generating AI prompts:", error.message);
    throw error; // Re-throw to let caller handle
  }
};

/**
 * Generate advanced writing prompts for premium users with specific topics
 * @param {string} topic - Specific topic (Gratitude, Forgiveness, Goals, etc.)
 * @param {string} mood - Current user mood
 * @returns {Promise<Array>} Array of 10 advanced writing prompts
 */
const generateAdvancedPrompts = async (topic = "reflection", mood = "") => {
  try {
    if (!model) {
      throw new Error("AI model not available - GEMINI_API_KEY required");
    }

    // Detect user language preference
    const userLanguage = detectUserLanguage();

    // Construct advanced AI prompt
    const aiPrompt = `Generate 10 sophisticated, in-depth writing prompts for mental health journaling focused on the topic: "${topic}".

Context:
- User's current mood: ${mood || "not specified"}
- Topic focus: ${topic}
- Tone: Thoughtful, introspective, encouraging deep reflection
- Language: ${userLanguage === "vi" ? "Vietnamese (Tiếng Việt)" : "English"}
- Target: Advanced emotional processing and personal growth

Requirements:
- Each prompt should be 1-2 sentences
- Focus on deep self-reflection and personal growth
- Encourage vulnerability and honest self-examination
- Be specific to the topic while remaining universal
- Avoid clichés and surface-level questions
- Encourage meaningful insights and discoveries
- ${
      userLanguage === "vi"
        ? "Use Vietnamese language naturally and culturally appropriate"
        : "Use English language naturally"
    }

Return as a JSON array of strings: ["prompt1", "prompt2", ...]`;

    const result = await model.generateContent(aiPrompt);
    const response = await result.response;
    const text = response.text();

    // Try to parse JSON response
    try {
      const suggestions = JSON.parse(text);
      if (Array.isArray(suggestions)) {
        console.log(
          `🤖 AI returned ${suggestions.length} advanced suggestions for topic: ${topic}`
        );
        return suggestions.slice(0, 10);
      }
    } catch (parseError) {
      // Minimal manual parse when JSON is not returned
      const lines = text
        .split("\n")
        .map((l) => l.replace(/^[\d\-\*\.\s]+/, "").trim())
        .filter((l) => l.length > 5);
      return lines.slice(0, 10);
    }
  } catch (error) {
    console.error("❌ Error generating advanced prompts:", error.message);
    throw error; // Re-throw to let caller handle
  }
};

/**
 * Generate mood-based reflection questions
 * @param {string} moodType - Type of mood (happy, sad, anxious, etc.)
 * @returns {Promise<Array>} Array of mood-specific questions
 */
const generateMoodReflections = async (moodType) => {
  if (!model) {
    throw new Error("AI model not available - GEMINI_API_KEY required");
  }

  const userLanguage = detectUserLanguage();
  const prompt = `Generate 3 brief mood-reflection questions for the mood: ${moodType}. 
Language: ${userLanguage === "vi" ? "Vietnamese (Tiếng Việt)" : "English"}
Return JSON array of strings.`;
  const result = await model.generateContent(prompt);
  const text = (await result.response).text();
  try {
    const arr = JSON.parse(text);
    if (Array.isArray(arr)) return arr.slice(0, 3);
  } catch {}
  const lines = text
    .split("\n")
    .map((l) => l.replace(/^[\d\-\*\.\s]+/, "").trim())
    .filter((l) => l);
  return lines.slice(0, 3);
};

/**
 * Advanced AI sentiment analysis for premium users
 * Detects depression, anxiety, and mental health indicators
 * @param {string} content - Journal content to analyze
 * @returns {Promise<Object>} Detailed sentiment analysis
 */
const analyzeSentiment = async (content) => {
  try {
    if (!model || !content) {
      throw new Error("AI model/content missing");
    }

    const analysisPrompt = `Analyze this journal entry for mental health indicators and sentiment:

"${content}"

Provide a detailed psychological analysis including:
1. Overall sentiment (positive/negative/neutral with 0-1 score)
2. Mental health indicators (signs of depression, anxiety, stress)
3. Risk assessment (low/medium/high)
4. Key emotional keywords found
5. Supportive recommendations (2-3 gentle suggestions)

Respond in this exact JSON format:
{
  "sentiment": {
    "score": 0.7,
    "label": "positive",
    "confidence": 0.85
  },
  "mentalHealthIndicators": {
    "depressionSigns": false,
    "anxietySigns": true,
    "stressSigns": false,
    "riskLevel": "medium",
    "details": "User mentions worry and sleep issues"
  },
  "keywords": {
    "positive": ["happy", "grateful"],
    "negative": ["worried", "tired"],
    "emotional": ["anxious", "hopeful"]
  },
  "recommendations": [
    "Consider practicing breathing exercises when feeling anxious",
    "Try to maintain a regular sleep schedule"
  ]
}`;

    const result = await model.generateContent(analysisPrompt);
    const response = await result.response;
    const text = response.text();

    try {
      const analysis = JSON.parse(text);
      analysis.aiPowered = true;
      return analysis;
    } catch (parseError) {
      // Minimal manual parse fallback
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const jsonBlock = lines.join(" ");
      const approx = JSON.parse(
        jsonBlock.replace(/(\w+):/g, '"$1":').replace(/'/g, '"')
      );
      approx.aiPowered = true;
      return approx;
    }
  } catch (error) {
    console.error("❌ Error in sentiment analysis:", error.message);
    throw error;
  }
};

/**
 * Generate personalized improvement plans for premium users
 * @param {Object} userProfile - User's mental health profile
 * @param {Array} recentAnalyses - Recent sentiment analyses
 * @returns {Promise<Object>} Personalized improvement plan
 */
const generateImprovementPlan = async (userProfile, recentAnalyses) => {
  try {
    if (!model) {
      throw new Error("AI model not available - GEMINI_API_KEY required");
    }

    const planPrompt = `Create a personalized 7-day mental wellness improvement plan based on:

User Profile:
- Recent mood patterns: ${JSON.stringify(userProfile)}
- Sentiment analysis trends: ${JSON.stringify(recentAnalyses)}

Create a supportive, evidence-based plan with:
1. Plan type (emotional_release, positivity_building, stress_management, etc.)
2. 7 daily activities (specific, actionable, 5-15 minutes each)
3. 3-5 practical tips
4. Motivational title

Respond in this JSON format:
{
  "planType": "emotional_release",
  "title": "Your Personal Emotional Release Journey",
  "duration": "7 days",
  "activities": [
    {"day": 1, "activity": "Write about your current feelings without judgment"},
    {"day": 2, "activity": "Practice the 4-7-8 breathing technique"}
  ],
  "tips": [
    "Allow yourself to feel emotions without trying to fix them",
    "Progress isn't linear - some days will be harder than others"
  ]
}`;

    const result = await model.generateContent(planPrompt);
    const response = await result.response;
    const text = response.text();

    try {
      const plan = JSON.parse(text);
      plan.aiPowered = true;
      return plan;
    } catch (parseError) {
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const jsonBlock = lines.join(" ");
      const approx = JSON.parse(
        jsonBlock.replace(/(\w+):/g, '"$1":').replace(/'/g, '"')
      );
      approx.aiPowered = true;
      return approx;
    }
  } catch (error) {
    console.error("❌ Error generating improvement plan:", error.message);
    throw error;
  }
};

/**
 * AI-powered personal assistant for emotional support
 * @param {string} question - User's question or concern
 * @param {Object} context - User context (recent moods, etc.)
 * @returns {Promise<Object>} AI assistant response
 */
const getAssistantResponse = async (question, context = {}) => {
  try {
    if (!model) {
      throw new Error("AI model not available - GEMINI_API_KEY required");
    }

    const assistantPrompt = `You are a supportive mental health companion. The user asks: "${question}"

Context about the user:
${JSON.stringify(context)}

Provide a compassionate, helpful response that:
- Acknowledges their feelings
- Offers gentle guidance
- Suggests healthy coping strategies
- Encourages professional help if needed
- Stays within ethical boundaries (not a replacement for therapy)

Respond in this JSON format:
{
  "response": "A supportive, empathetic response...",
  "suggestions": [
    "Practical suggestion 1",
    "Practical suggestion 2"
  ],
  "resources": [
    "Optional mental health resources if relevant"
  ]
}`;

    const result = await model.generateContent(assistantPrompt);
    const response = await result.response;
    const text = response.text();

    try {
      const assistantResponse = JSON.parse(text);
      assistantResponse.aiPowered = true;
      return assistantResponse;
    } catch (parseError) {
      const lines = text
        .split("\n")
        .map((l) => l.replace(/^[\d\-\*\.\s]+/, "").trim())
        .filter((l) => l.length > 5);
      return {
        response: lines[0] || "",
        suggestions: lines.slice(1, 3),
        aiPowered: true,
      };
    }
  } catch (error) {
    console.error("❌ Error in AI assistant:", error.message);
    throw error;
  }
};

/**
 * Analyze keyword frequency and emotional patterns
 * @param {Array} journalEntries - Array of journal entries
 * @returns {Object} Keyword analysis results
 */
const analyzeKeywords = (journalEntries) => {
  const allText = journalEntries
    .map((entry) => entry.content || "")
    .join(" ")
    .toLowerCase();

  // Emotional keyword categories
  const emotionalKeywords = {
    positive: [
      "happy",
      "joy",
      "grateful",
      "love",
      "excited",
      "peaceful",
      "confident",
      "hopeful",
      "proud",
      "content",
    ],
    negative: [
      "sad",
      "angry",
      "frustrated",
      "disappointed",
      "hurt",
      "lonely",
      "overwhelmed",
      "stressed",
    ],
    anxiety: [
      "worried",
      "anxious",
      "nervous",
      "panic",
      "fear",
      "uncertain",
      "restless",
    ],
    depression: [
      "depressed",
      "hopeless",
      "empty",
      "worthless",
      "tired",
      "numb",
      "lost",
    ],
  };

  const keywordFrequency = {};
  const categoryFrequency = {
    positive: 0,
    negative: 0,
    anxiety: 0,
    depression: 0,
  };

  // Count keyword frequencies
  Object.entries(emotionalKeywords).forEach(([category, words]) => {
    words.forEach((word) => {
      const regex = new RegExp(`\\b${word}\\b`, "gi");
      const matches = allText.match(regex) || [];
      const count = matches.length;

      if (count > 0) {
        keywordFrequency[word] = count;
        categoryFrequency[category] += count;
      }
    });
  });

  // Calculate emotional balance
  const totalEmotional = Object.values(categoryFrequency).reduce(
    (sum, count) => sum + count,
    0
  );
  const emotionalBalance =
    totalEmotional > 0
      ? {
          positiveRatio: (
            (categoryFrequency.positive / totalEmotional) *
            100
          ).toFixed(1),
          negativeRatio: (
            (categoryFrequency.negative / totalEmotional) *
            100
          ).toFixed(1),
          anxietyRatio: (
            (categoryFrequency.anxiety / totalEmotional) *
            100
          ).toFixed(1),
          depressionRatio: (
            (categoryFrequency.depression / totalEmotional) *
            100
          ).toFixed(1),
        }
      : null;

  return {
    keywordFrequency: Object.entries(keywordFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20), // Top 20 most frequent emotional keywords
    categoryFrequency,
    emotionalBalance,
    totalWords: allText.split(" ").length,
    totalEmotionalWords: totalEmotional,
    insights: generateKeywordInsights(categoryFrequency, emotionalBalance),
  };
};

/**
 * Generate insights from keyword analysis
 */
const generateKeywordInsights = (categoryFreq, balance) => {
  const insights = [];

  if (balance) {
    if (parseFloat(balance.positiveRatio) > 60) {
      insights.push(
        "✨ Your writing shows a predominantly positive outlook - that's wonderful!"
      );
    }

    if (parseFloat(balance.anxietyRatio) > 30) {
      insights.push(
        "⚠️ You frequently mention anxiety-related feelings. Consider stress management techniques."
      );
    }

    if (parseFloat(balance.depressionRatio) > 25) {
      insights.push(
        "💙 You've mentioned some difficult emotions. Remember that it's okay to seek support."
      );
    }

    if (
      categoryFreq.positive >
      categoryFreq.negative + categoryFreq.anxiety + categoryFreq.depression
    ) {
      insights.push(
        "🌟 Your emotional vocabulary leans positive - you're building emotional resilience!"
      );
    }
  }

  if (insights.length === 0) {
    insights.push(
      "📝 Keep journaling to build a clearer picture of your emotional patterns."
    );
  }

  return insights;
};

/**
 * Generate recommendations based on sentiment analysis
 */
const generateRecommendations = (
  depressionCount,
  anxietyCount,
  positiveCount
) => {
  const recommendations = [];

  if (depressionCount >= 2) {
    recommendations.push(
      "Consider reaching out to a mental health professional for support"
    );
    recommendations.push(
      "Try to engage in activities that previously brought you joy"
    );
  }

  if (anxietyCount >= 2) {
    recommendations.push(
      "Practice deep breathing exercises when feeling overwhelmed"
    );
    recommendations.push(
      "Try grounding techniques: name 5 things you can see, 4 you can touch, 3 you can hear"
    );
  }

  if (positiveCount >= 2) {
    recommendations.push(
      "Great job recognizing positive moments - continue building on this strength"
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "Continue journaling to track your emotional patterns"
    );
    recommendations.push("Remember to practice self-compassion");
  }

  return recommendations;
};

/**
 * Detect user language preference
 * @returns {string} 'vi' for Vietnamese, 'en' for English
 */
const detectUserLanguage = () => {
  // For now, default to Vietnamese since this is a Vietnamese project
  // In the future, this could be based on:
  // - User's browser language
  // - User's profile settings
  // - User's previous journal entries language
  // - IP geolocation
  return "vi"; // Default to Vietnamese
};

/**
 * Check if AI service is available
 * @returns {boolean} True if AI is available
 */
const isAIAvailable = () => {
  return !!model;
};

module.exports = {
  generateWritingPrompts,
  generateAdvancedPrompts,
  generateMoodReflections,
  analyzeSentiment,
  generateImprovementPlan,
  getAssistantResponse,
  analyzeKeywords,
  isAIAvailable,
  detectUserLanguage,
};
