import { TeamsActivityHandler, TurnContext, CardFactory } from "botbuilder";
import axios from 'axios';

// Define a type for tracking conversation history
interface ConversationHistory {
  [userId: string]: Array<{ prompt: string; response: string }>;
}

export class TeamsBot extends TeamsActivityHandler {
  private ollamaApiUrl: string = "http://10.1.1.33:11434"; // Default URL
  private conversationHistory: ConversationHistory = {}; // Track conversation history

  constructor() {
    super();

    this.onMessage(async (context, next) => {
      // console.log("Running with Message Activity.");

      // Remove the mention of the bot from the message
      const removedMentionText = TurnContext.removeRecipientMention(context.activity);
      const prompt = removedMentionText.toLowerCase().replace(/\n|\r/g, "").trim();

      // Retrieve the user's ID
      const userId = context.activity.from.id;

      // Ensure a history array exists for the user
      if (!this.conversationHistory[userId]) {
        this.conversationHistory[userId] = [];
      }

      // Handle the /config command
      if (prompt === "/config") {
        await this.showConfigTaskModule(context);
      } else {
        // Call Ollama API with the current prompt and conversation history
        const response = await this.getOllamaResponse(prompt, this.conversationHistory[userId]);
        
        // Update the conversation history with the current interaction
        this.conversationHistory[userId].push({ prompt, response });

        // Send the response back to the user
        await context.sendActivity(`Ollama: ${response}`);
      }

      // By calling next() you ensure that the next BotHandler is run.
      await next();
    });
  }

  private async showConfigTaskModule(context: TurnContext) {
    const taskModuleResponse = {
      task: {
        type: "continue",
        value: {
          title: "Configure Ollama API",
          height: 200,
          width: 400,
          card: CardFactory.adaptiveCard({
            type: "AdaptiveCard",
            body: [
              {
                type: "TextBlock",
                text: "Enter the Ollama API URL:",
                weight: "Bolder",
                size: "Medium",
              },
              {
                type: "Input.Text",
                id: "apiUrl",
                placeholder: "https://api.ollama.com",
                value: this.ollamaApiUrl, // Prepopulate with existing or default value
              }
            ],
            actions: [
              {
                type: "Action.Submit",
                title: "Save",
                data: {
                  action: "saveConfig"
                }
              }
            ],
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            version: "1.3"
          })
        }
      }
    };

    await context.sendActivity({
      type: "invokeResponse",
      value: taskModuleResponse
    });
  }

  protected async onTeamsTaskModuleSubmit(context: TurnContext, taskModuleRequest: any) {
    if (taskModuleRequest.data.action === "saveConfig") {
      this.ollamaApiUrl = taskModuleRequest.data.apiUrl;
      await context.sendActivity(`API URL has been set to: ${this.ollamaApiUrl}`);
    }
  }

  private async getOllamaResponse(prompt: string, history: Array<{ prompt: string; response: string }>): Promise<string> {
    const fullPrompt = this.constructFullPrompt(prompt, history);

    const data = {
      model: "llama3.1:8b-instruct-q8_0",
      prompt: fullPrompt,
      stream: false
    };

    try {
      const response = await axios.post(this.ollamaApiUrl + "/api/generate", data);
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

  private constructFullPrompt(prompt: string, history: Array<{ prompt: string; response: string }>): string {
    // Construct a full prompt that includes the conversation history
    const historyText = history.map(entry => `User: ${entry.prompt}\nBot: ${entry.response}`).join("\n");
    return `${historyText}\nUser: ${prompt}\nBot:`;
  }
}
