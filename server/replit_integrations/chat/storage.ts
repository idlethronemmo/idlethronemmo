// Stub: replit integrations chat storage (unused in production)
export interface IChatStorage {
  getConversation(id: number): Promise<any>;
  getAllConversations(): Promise<any[]>;
  createConversation(title: string): Promise<any>;
  deleteConversation(id: number): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<any[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<any>;
}

export const chatStorage: IChatStorage = {
  async getConversation(_id: number) { return undefined; },
  async getAllConversations() { return []; },
  async createConversation(_title: string) { return {}; },
  async deleteConversation(_id: number) {},
  async getMessagesByConversation(_conversationId: number) { return []; },
  async createMessage(_conversationId: number, _role: string, _content: string) { return {}; },
};
