/**
 * Vercel Serverless Function (Node.js)
 * This file will be deployed as a secure API endpoint: /api/generate
 * * It receives a "blueprint" from the frontend, securely calls the 
 * OpenRouter API with a secret key, and streams the response back.
 */

// We are using the CommonJS 'require' syntax because it's the most
// robust and default for Vercel's Node.js runtime environment.
// We can't use 'import' here without a package.json.


// This is the main handler function Vercel will run
module.exports = async (req, res) => {
    
    // 1. Check for POST request and JSON body
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }
    
    const { blueprint } = req.body;
    if (!blueprint) {
        return res.status(400).json({ error: 'Missing "blueprint" in request body' });
    }

    // 2. Securely get the API key from environment variables
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

    if (!OPENROUTER_API_KEY) {
        console.error('OPENROUTER_API_KEY is not set.');
        return res.status(500).json({ error: 'Server configuration error: API key not found.' });
    }

    // 3. Define the AI's role and the required JSON format (System Prompt)
    const systemPrompt = `You are an expert question paper generator named "Coopergen". 
Your task is to create a well-structured question paper based on a user's blueprint.
You MUST return the paper in a single, valid JSON object.
Do NOT include any markdown formatting (like \`\`\`json) or explanatory text outside the JSON.

The JSON structure MUST be:
{
  "metadata": {
    "board": "...",
    "class": "...",
    "subject": "...",
    "topic": "...",
    "difficulty": "...",
    "language": "...",
    "time": 120, // (in minutes)
    "totalMarks": 70
  },
  "sections": [
    {
      "title": "Section A: Multiple Choice Questions",
      "marks": 10,
      "questions": [
        { "q_num": 1, "question": "What is...?", "options": ["A", "B", "C", "D"], "answer": "A", "marks": 1 },
        { "q_num": 2, "question": "...", "options": ["A", "B", "C", "D"], "answer": "C", "marks": 1 }
      ]
    },
    {
      "title": "Section B: Short Answer Questions",
      "marks": 30,
      "questions": [
        { "q_num": 3, "question": "Define...", "answer": "...", "marks": 3 },
        { "q_num": 4, "question": "Explain...", "answer": "...", "marks": 3 }
      ]
    },
    {
      "title": "Section C: Long Answer Questions",
      "marks": 30,
      "questions": [
        { "q_num": 5, "question": "Describe in detail...", "answer": "...", "marks": 10 }
      ]
    }
  ]
}

- Ensure question numbers (q_num) are sequential for the whole paper.
- The total marks of all sections must add up to the "totalMarks" in the metadata.
- Generate the number of questions as specified in the blueprint (mcq, short, long, numerical).
- If the blueprint's language is "Hindi", all text ('question', 'options', 'answer', 'title') MUST be in Hindi.
`;

    // 4. Create the user prompt with the blueprint
    const userPrompt = `Generate a question paper using the following blueprint:
${JSON.stringify(blueprint, null, 2)}
`;

    try {
        // 5. Call the OpenRouter API
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                // Recommended headers for OpenRouter
                "HTTP-Referer": "https://coopergen-app.com", // Replace with your deployed domain later
                "X-Title": "Coopergen"
            },
            body: JSON.stringify({
                // Using a fast and capable model that supports JSON mode
                "model": "mistralai/mistral-7b-instruct", 
                "response_format": { "type": "json_object" }, // Force JSON output!
                "messages": [
                    { "role": "system", "content": systemPrompt },
                    { "role": "user", "content": userPrompt }
                ]
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error('OpenRouter API error:', errorBody);
            return res.status(response.status).json({ error: `AI API error: ${errorBody}` });
        }

        const data = await response.json();
        
        // 6. Extract the AI's JSON response and send it to the frontend
        const aiMessage = data.choices[0].message.content;
        
        try {
            // Parse the JSON string from the AI to ensure it's valid
            const paperJson = JSON.parse(aiMessage);
            
            // Send the final JSON paper to the frontend
            // The frontend expects { paper: {...} }
            return res.status(200).json({ paper: paperJson });
            
        } catch (parseError) {
            console.error('Failed to parse AI JSON response:', parseError);
            console.error('Raw AI response:', aiMessage);
            return res.status(500).json({ error: 'AI returned invalid JSON.', details: aiMessage });
        }

    } catch (error) {
        console.error('Error calling generation API:', error);
        return res.status(500).json({ error: `Server error: ${error.message}` });
    }
};
