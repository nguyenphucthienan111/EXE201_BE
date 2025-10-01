const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini AI
let genAI;
let model;

try {
  const apiKey =
    process.env.GEMINI_API_KEY || "AIzaSyDt91g9nNFgR4Y-lO1J4nRvDvJ_QT1tE_M";

  if (!apiKey || apiKey === "AIzaSyDt91g9nNFgR4Y-lO1J4nRvDvJ_QT1tE_M") {
    console.warn(
      "⚠️ GEMINI_API_KEY not set. AI suggestions will use fallback prompts."
    );
  } else {
    genAI = new GoogleGenerativeAI(apiKey);
    model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    console.log("✅ Google Gemini AI initialized successfully.");
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
    // Fallback prompts if AI not available
    const fallbackPrompts = {
      basic: [
        "How do you feel today and what made you feel this way?",
        "What is one good thing that happened today?",
        "What challenged you today and how did you respond?",
        "Write about someone who made you smile today.",
        "What are you looking forward to tomorrow?",
        "Describe a moment when you felt proud of yourself.",
        "What is something you learned about yourself recently?",
        "Write about a challenge you overcame this week.",
        "What brings you peace and calm?",
        "How have you grown as a person lately?",
      ],
      happy: [
        "What specifically made you feel happy today?",
        "How can you recreate this positive feeling?",
        "Who or what contributed to your happiness?",
        "What are you most grateful for right now?",
        "Describe a moment that brought you pure joy.",
        "What positive energy do you want to carry forward?",
        "How can you share this happiness with others?",
        "What does this happiness teach you about yourself?",
        "What small things in life make you smile?",
        "How can you maintain this positive mindset?",
      ],
      sad: [
        "What is making you feel sad right now?",
        "How can you be kind to yourself during this difficult time?",
        "What small thing might help you feel a bit better?",
        "Who can you reach out to for support?",
        "What has helped you through sadness before?",
        "What would you tell a friend going through this?",
        "What are some things you still appreciate despite feeling sad?",
        "How can you honor these feelings without being overwhelmed?",
        "What gentle activities might bring you comfort?",
        "What does this sadness teach you about what matters to you?",
      ],
      anxious: [
        "What thoughts are making you feel anxious?",
        "What are 3 things you can control in this situation?",
        "What breathing or grounding techniques help you?",
        "What evidence do you have that things will be okay?",
        "How can you break this worry into smaller, manageable pieces?",
        "What has helped you through anxiety before?",
        "What would you say to calm a worried friend?",
        "What activities help you feel more centered?",
        "How can you practice self-compassion right now?",
        "What small step can you take to address your concerns?",
      ],
      stressed: [
        "What is causing you stress right now and how can you address it?",
        "Describe a moment when you felt calm today.",
        "What helps you relax when you feel overwhelmed?",
        "Write about a coping strategy that works for you.",
        "What can you let go of to reduce your stress?",
        "How can you create more balance in your life?",
        "What boundaries do you need to set?",
        "What activities help you recharge?",
        "How can you practice mindfulness in this moment?",
        "What support do you need right now?",
      ],
      gratitude: [
        "List 3 things you're grateful for today and why.",
        "Write about a person you're thankful to have in your life.",
        "What small moment brought you joy today?",
        "Describe something beautiful you noticed today.",
        "What challenge are you grateful to have overcome?",
        "Who has made a positive impact on your life recently?",
        "What simple pleasure are you thankful for?",
        "How has gratitude changed your perspective?",
        "What opportunity are you grateful to have?",
        "What lesson are you thankful to have learned?",
      ],
      reflection: [
        "What did you learn about yourself today?",
        "How have you grown compared to last month?",
        "What pattern in your emotions have you noticed lately?",
        "Write about a recent challenge and what it taught you.",
        "What values are most important to you right now?",
        "How have your priorities shifted recently?",
        "What would you do differently if you could?",
        "What strengths have you discovered in yourself?",
        "How do you want to evolve as a person?",
        "What wisdom would you share with your past self?",
      ],
    };

    // If AI is not available, use fallback
    if (!model) {
      console.log("🤖 AI not available, using fallback prompts");
      const promptCategory = topic || mood || "basic";
      const prompts = fallbackPrompts[promptCategory] || fallbackPrompts.basic;
      const result = prompts.slice(0, isPremium ? 10 : 3);
      console.log(
        `📝 Returning ${result.length} fallback prompts for ${
          isPremium ? "premium" : "free"
        } user (category: ${promptCategory})`
      );
      return result;
    }

    // Construct AI prompt
    const aiPrompt = `Generate ${
      isPremium ? "10" : "3"
    } thoughtful, gentle writing prompts for mental health journaling.
    
Context:
- User's current mood: ${mood || "not specified"}
- Topic focus: ${topic || "general reflection"}
- Tone: Supportive, non-judgmental, encouraging
- Language: Vietnamese (if possible) or English
- Target: Personal emotional processing and self-reflection

Requirements:
- Each prompt should be 1-2 sentences
- Focus on emotional well-being and self-discovery
- Avoid triggering or negative language
- Encourage positive introspection
- Be specific and actionable

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

    // Fallback: Parse text response manually
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

    // Return fallback prompts on error
    const fallbackPrompts = [
      "How do you feel today and what made you feel this way?",
      "What is one good thing that happened today?",
      "What challenged you today and how did you respond?",
      "Write about someone who made you smile today.",
      "What are you looking forward to tomorrow?",
      "Describe a moment when you felt proud of yourself.",
      "What is something you learned about yourself recently?",
      "Write about a challenge you overcame this week.",
      "What brings you peace and calm?",
      "How have you grown as a person lately?",
    ];

    const errorResult = fallbackPrompts.slice(0, isPremium ? 10 : 3);
    console.log(
      `🔄 Error fallback returned ${errorResult.length} suggestions for ${
        isPremium ? "premium" : "free"
      } user`
    );
    return errorResult;
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
    // Advanced fallback prompts by topic
    const advancedPrompts = {
      Gratitude: [
        "Write about a person who has made a profound impact on your life and why you're grateful for them.",
        "Describe a challenging experience that you're now grateful for and what it taught you.",
        "List 10 small, everyday things you're grateful for that you might normally take for granted.",
        "Write a letter of gratitude to your past self for the strength they showed during difficult times.",
        "Reflect on a moment when someone's kindness unexpectedly touched your heart.",
        "What are you grateful for about your current season of life, even if it's challenging?",
        "Describe how practicing gratitude has changed your perspective on life.",
        "Write about a place that holds special meaning for you and why you're grateful for it.",
        "What lesson are you grateful to have learned from a mistake or failure?",
        "Reflect on the people, experiences, or opportunities that have shaped who you are today.",
      ],
      Forgiveness: [
        "Write about someone you need to forgive and what that forgiveness would mean for your peace.",
        "Describe a situation where you need to forgive yourself and how you can begin that process.",
        "Reflect on a time when someone forgave you and how that impacted your relationship.",
        "What does forgiveness mean to you, and how has your understanding of it evolved?",
        "Write about the difference between forgiveness and reconciliation in your life.",
        "Describe how holding onto resentment has affected you and what letting go might look like.",
        "Reflect on a time when you forgave someone and how it changed your perspective.",
        "What boundaries do you need to set while still practicing forgiveness?",
        "Write about the role of self-forgiveness in your personal growth journey.",
        "How can you practice forgiveness as an act of self-care and healing?",
      ],
      Goals: [
        "Write about your most important goal for this year and why it matters to you.",
        "Describe the person you want to become in 5 years and what steps will get you there.",
        "Reflect on a goal you achieved and what the journey taught you about yourself.",
        "What fears or limiting beliefs are holding you back from pursuing your dreams?",
        "Write about a goal that scares you but excites you at the same time.",
        "Describe how your goals align with your core values and life purpose.",
        "What support system do you need to achieve your most important goals?",
        "Reflect on a time when you had to adjust your goals and what you learned from that.",
        "Write about the difference between goals that fulfill you versus those that drain you.",
        "How can you break down your biggest goal into smaller, manageable steps?",
      ],
      Relationships: [
        "Write about the most important relationship in your life and what makes it special.",
        "Describe a relationship that has taught you something valuable about yourself.",
        "Reflect on how you show love and how you prefer to receive it.",
        "What boundaries do you need to set in your relationships to protect your well-being?",
        "Write about a time when you had to have a difficult conversation and what you learned.",
        "Describe the qualities you value most in your closest friendships.",
        "Reflect on how your relationships have evolved as you've grown as a person.",
        "What does healthy conflict resolution look like in your relationships?",
        "Write about a relationship that ended and what it taught you about love and loss.",
        "How do you maintain meaningful connections while also protecting your energy?",
      ],
      Self_Discovery: [
        "Write about a moment when you felt most authentically yourself.",
        "Describe the values that are most important to you and how they guide your decisions.",
        "Reflect on how your understanding of yourself has changed over the past year.",
        "What aspects of your personality do you want to develop or change?",
        "Write about a time when you surprised yourself with your own strength or capability.",
        "Describe the things that make you feel most alive and energized.",
        "Reflect on the stories you tell yourself about who you are and whether they serve you.",
        "What would you do if you weren't afraid of what others might think?",
        "Write about the parts of yourself you're still learning to accept and love.",
        "How do you want to be remembered, and what does that say about your priorities?",
      ],
      reflection: [
        "What did you learn about yourself today?",
        "How have you grown compared to last month?",
        "What pattern in your emotions have you noticed lately?",
        "Write about a recent challenge and what it taught you.",
        "What values are most important to you right now?",
        "How have your priorities shifted recently?",
        "What would you do differently if you could?",
        "What strengths have you discovered in yourself?",
        "How do you want to evolve as a person?",
        "What wisdom would you share with your past self?",
      ],
    };

    // If AI is not available, use advanced fallback
    if (!model) {
      console.log("🤖 AI not available, using advanced fallback prompts");
      const prompts = advancedPrompts[topic] || advancedPrompts.reflection;
      console.log(
        `📝 Returning ${prompts.length} advanced prompts for topic: ${topic}`
      );
      return prompts;
    }

    // Construct advanced AI prompt
    const aiPrompt = `Generate 10 sophisticated, in-depth writing prompts for mental health journaling focused on the topic: "${topic}".

Context:
- User's current mood: ${mood || "not specified"}
- Topic focus: ${topic}
- Tone: Thoughtful, introspective, encouraging deep reflection
- Language: English (preferably) or Vietnamese
- Target: Advanced emotional processing and personal growth

Requirements:
- Each prompt should be 1-2 sentences
- Focus on deep self-reflection and personal growth
- Encourage vulnerability and honest self-examination
- Be specific to the topic while remaining universal
- Avoid clichés and surface-level questions
- Encourage meaningful insights and discoveries

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
      console.warn("⚠️ AI response not valid JSON, using fallback");
    }

    // Use advanced fallback prompts
    const prompts = advancedPrompts[topic] || advancedPrompts.reflection;
    console.log(
      `📝 Using ${prompts.length} advanced fallback prompts for topic: ${topic}`
    );
    return prompts;
  } catch (error) {
    console.error("❌ Error generating advanced prompts:", error.message);

    // Return advanced fallback prompts on error
    const advancedPrompts = {
      Gratitude: [
        "Write about a person who has made a profound impact on your life and why you're grateful for them.",
        "Describe a challenging experience that you're now grateful for and what it taught you.",
        "List 10 small, everyday things you're grateful for that you might normally take for granted.",
      ],
      Forgiveness: [
        "Write about someone you need to forgive and what that forgiveness would mean for your peace.",
        "Describe a situation where you need to forgive yourself and how you can begin that process.",
        "Reflect on a time when someone forgave you and how that impacted your relationship.",
      ],
      Goals: [
        "Write about your most important goal for this year and why it matters to you.",
        "Describe the person you want to become in 5 years and what steps will get you there.",
        "Reflect on a goal you achieved and what the journey taught you about yourself.",
      ],
    };

    const prompts = advancedPrompts[topic] || advancedPrompts.Gratitude;
    console.log(
      `🔄 Error fallback returned ${prompts.length} advanced prompts for topic: ${topic}`
    );
    return prompts;
  }
};

/**
 * Generate mood-based reflection questions
 * @param {string} moodType - Type of mood (happy, sad, anxious, etc.)
 * @returns {Promise<Array>} Array of mood-specific questions
 */
const generateMoodReflections = async (moodType) => {
  const moodPrompts = {
    happy: [
      "What specifically made you feel happy today?",
      "How can you recreate this positive feeling?",
      "Who or what contributed to your happiness?",
    ],
    sad: [
      "What is making you feel sad right now?",
      "How can you be kind to yourself during this difficult time?",
      "What small thing might help you feel a bit better?",
    ],
    anxious: [
      "What thoughts are making you feel anxious?",
      "What are 3 things you can control in this situation?",
      "How can you ground yourself right now?",
    ],
    angry: [
      "What triggered your anger today?",
      "What would help you process these feelings healthily?",
      "What boundary might you need to set?",
    ],
    neutral: [
      "How would you describe your energy level today?",
      "What could make today feel more meaningful?",
      "What are you curious about right now?",
    ],
  };

  return moodPrompts[moodType] || moodPrompts.neutral;
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
      // Fallback analysis
      return {
        sentiment: {
          score: 0.5,
          label: "neutral",
          confidence: 0.6,
        },
        mentalHealthIndicators: {
          depressionSigns: false,
          anxietySigns: false,
          stressSigns: false,
          riskLevel: "low",
        },
        keywords: {
          positive: [],
          negative: [],
          emotional: [],
        },
        recommendations: [
          "Continue journaling to track your emotional patterns.",
        ],
        aiPowered: false,
      };
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
      console.warn("⚠️ AI analysis response not valid JSON, using fallback");

      // Smart fallback based on keywords
      const lowerContent = content.toLowerCase();
      const depressionKeywords = [
        "sad",
        "hopeless",
        "empty",
        "worthless",
        "depressed",
        "lonely",
      ];
      const anxietyKeywords = [
        "worried",
        "anxious",
        "panic",
        "fear",
        "nervous",
        "stress",
      ];
      const positiveKeywords = [
        "happy",
        "grateful",
        "joy",
        "love",
        "excited",
        "peaceful",
      ];

      const depressionCount = depressionKeywords.filter((word) =>
        lowerContent.includes(word)
      ).length;
      const anxietyCount = anxietyKeywords.filter((word) =>
        lowerContent.includes(word)
      ).length;
      const positiveCount = positiveKeywords.filter((word) =>
        lowerContent.includes(word)
      ).length;

      const totalEmotional = depressionCount + anxietyCount + positiveCount;
      const sentimentScore =
        totalEmotional > 0 ? positiveCount / totalEmotional : 0.5;

      return {
        sentiment: {
          score: sentimentScore,
          label:
            sentimentScore > 0.6
              ? "positive"
              : sentimentScore < 0.4
              ? "negative"
              : "neutral",
          confidence: Math.min(0.8, totalEmotional * 0.2),
        },
        mentalHealthIndicators: {
          depressionSigns: depressionCount >= 2,
          anxietySigns: anxietyCount >= 2,
          stressSigns: anxietyCount >= 1,
          riskLevel:
            depressionCount + anxietyCount >= 3
              ? "high"
              : depressionCount + anxietyCount >= 1
              ? "medium"
              : "low",
          details: `Detected ${depressionCount} depression indicators, ${anxietyCount} anxiety indicators`,
        },
        keywords: {
          positive: positiveKeywords.filter((word) =>
            lowerContent.includes(word)
          ),
          negative: [...depressionKeywords, ...anxietyKeywords].filter((word) =>
            lowerContent.includes(word)
          ),
          emotional: [
            ...depressionKeywords,
            ...anxietyKeywords,
            ...positiveKeywords,
          ].filter((word) => lowerContent.includes(word)),
        },
        recommendations: generateRecommendations(
          depressionCount,
          anxietyCount,
          positiveCount
        ),
        aiPowered: false,
      };
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
      // Fallback improvement plan
      return {
        planType: "basic_wellness",
        title: "Basic Wellness Plan",
        duration: "7 days",
        activities: [
          { day: 1, activity: "Practice 5-minute breathing meditation" },
          { day: 2, activity: "Write about 3 things you're grateful for" },
          { day: 3, activity: "Take a 10-minute walk outdoors" },
          { day: 4, activity: "Connect with a friend or family member" },
          { day: 5, activity: "Practice a hobby you enjoy" },
          { day: 6, activity: "Reflect on your progress this week" },
          { day: 7, activity: "Plan self-care activities for next week" },
        ],
        tips: [
          "Be patient with yourself as you develop new habits",
          "Small consistent actions lead to big changes",
          "Celebrate your progress, no matter how small",
        ],
        aiPowered: false,
      };
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
      console.warn("⚠️ AI plan response not valid JSON, using fallback");
      return {
        planType: "personalized_wellness",
        title: "Your Wellness Journey",
        duration: "7 days",
        activities: [
          { day: 1, activity: "Reflect on your emotional patterns" },
          { day: 2, activity: "Practice mindful breathing for 5 minutes" },
          { day: 3, activity: "Write about your strengths and achievements" },
          { day: 4, activity: "Connect with supportive people in your life" },
          { day: 5, activity: "Engage in a physical activity you enjoy" },
          { day: 6, activity: "Practice gratitude journaling" },
          { day: 7, activity: "Set intentions for the upcoming week" },
        ],
        tips: [
          "Focus on progress, not perfection",
          "Be compassionate with yourself",
          "Small steps lead to lasting change",
        ],
        aiPowered: false,
      };
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
      return {
        response: `I hear that you're asking about "${question}". While I'm in basic mode, I'd encourage you to continue journaling about your feelings and consider speaking with a mental health professional if you need additional support.`,
        suggestions: [
          "Try writing about this concern in your journal",
          "Consider talking to a trusted friend or counselor",
          "Practice self-care and be patient with yourself",
        ],
        aiPowered: false,
      };
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
      return {
        response: `Thank you for sharing "${question}" with me. It's important to acknowledge what you're going through. Journaling can be a powerful tool for processing emotions and gaining clarity.`,
        suggestions: [
          "Continue writing about your thoughts and feelings",
          "Consider speaking with a mental health professional",
          "Practice self-compassion during difficult times",
        ],
        aiPowered: false,
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
};
