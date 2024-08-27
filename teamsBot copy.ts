import { TeamsActivityHandler, TurnContext } from "botbuilder";
import axios from "axios";

// Define a type for tracking conversation history
interface ConversationHistory {
  [userId: string]: Array<{ prompt: string; response: string }>;
}

export class TeamsBot extends TeamsActivityHandler {
  private conversationHistory: ConversationHistory = {};

  constructor() {
    super();

    this.onMessage(async (context, next) => {
      console.log("Running with Message Activity.");
      
      // Remove the mention of the bot from the message
      const removedMentionText = TurnContext.removeRecipientMention(context.activity);
      const prompt = removedMentionText.toLowerCase().replace(/\n|\r/g, "").trim();

      // Retrieve the user's ID
      const userId = context.activity.from.id;

      // Ensure a history array exists for the user
      if (!this.conversationHistory[userId]) {
        this.conversationHistory[userId] = [];
      }

      // Call Ollama API with the current prompt and conversation history
      const generatedResponse = await this.getOllamaResponse(prompt, this.conversationHistory[userId]);

      // Update the conversation history with the current interaction
      this.conversationHistory[userId].push({ prompt, response: generatedResponse });

      // Send the response back to the user
      await context.sendActivity(`Ollama: ${generatedResponse}`);

      // By calling next() you ensure that the next BotHandler is run.
      await next();
    });

    this.onMembersAdded(async (context, next) => {
      const membersAdded = context.activity.membersAdded;
      for (let cnt = 0; cnt < membersAdded.length; cnt++) {
        if (membersAdded[cnt].id) {
          await context.sendActivity(
            `Hi there! I'm a Teams bot that uses Ollama to generate responses.`
          );
          break;
        }
      }
      await next();
    });
  }

  // Function to call the Ollama API
  private async getOllamaResponse(prompt: string, history: Array<{ prompt: string; response: string }>): Promise<string> {
    const url = "http://10.1.1.33:11434/api/generate";

    // Construct a full prompt that includes the conversation history
    const historyText = history.map(entry => `User: ${entry.prompt}\nBot: ${entry.response}`).join("\n");
    const fullPrompt = `${historyText}\nUser: ${prompt}\nBot:`;

    const data = {
      model: "llama3.1:8b-instruct-q8_0",
      prompt: fullPrompt,
      stream: false
    };

    try {
      const response = await axios.post(url, data);
      if (response.status === 200) {
        // Extract the generated text
        const result = response.data;
        return result.response || "No response generated.";
      } else {
        console.error("Error in response from Ollama:", response.status, response.data);
        return "There was an error processing your request.";
      }
    } catch (error) {
      console.error("Error calling Ollama API:", error);
      return "There was an error contacting the API.";
    }
  }
}
