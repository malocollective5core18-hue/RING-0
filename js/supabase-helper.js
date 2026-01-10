// Supabase Helper Functions for Card Management
class SupabaseCardManager {
  constructor() {
    this.tableName = 'cards';
    this.maxRetries = 3;
  }

  // Generate unique ID
  generateId() {
    return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  // Create a new card
  async createCard(cardData) {
    try {
      // Validate required fields
      if (!cardData.title || !cardData.description || !cardData.end) {
        throw new Error('Missing required fields');
      }

      const newCard = {
        id: this.generateId(),
        title: cardData.title.trim(),
        description: cardData.description.trim(),
        file_url: cardData.fileUrl || '#',
        start_time: cardData.start || new Date().toISOString(),
        end_time: cardData.end,
        status: 'active',
        created_at: new Date().toISOString(),
        created_by: cardData.createdBy || 'admin',
        category: cardData.category || 'general',
        priority: cardData.priority || 'medium'
      };

      console.log('Creating card in Supabase:', newCard);

      const { data, error } = await window.supabaseClient
        .from(this.tableName)
        .insert([newCard])
        .select()
        .single();

      if (error) {
        console.error('Supabase create error:', error);
        throw error;
      }

      console.log('Card created successfully:', data);
      return { success: true, data: data };
    } catch (error) {
      console.error('Failed to create card:', error);
      return { success: false, error: error.message };
    }
  }

  // Get all active cards
  async getAllCards(includeCancelled = false) {
    try {
      let query = window.supabaseClient
        .from(this.tableName)
        .select('*')
        .order('created_at', { ascending: false });

      if (!includeCancelled) {
        query = query.eq('status', 'active');
      }

      const { data, error } = await query;

      if (error) {
        console.error('Supabase fetch error:', error);
        throw error;
      }

      // Transform data to match our app format
      const formattedData = data.map(card => ({
        id: card.id,
        title: card.title,
        description: card.description,
        fileUrl: card.file_url,
        start: card.start_time,
        end: card.end_time,
        status: card.status,
        createdAt: card.created_at,
        createdBy: card.created_by,
        category: card.category,
        priority: card.priority,
        updatedAt: card.updated_at
      }));

      return { success: true, data: formattedData };
    } catch (error) {
      console.error('Failed to fetch cards:', error);
      return { success: false, error: error.message, data: [] };
    }
  }

  // Update a card
  async updateCard(cardId, updates) {
    try {
      const updateData = {
        ...updates,
        updated_at: new Date().toISOString()
      };

      console.log('Updating card:', cardId, updateData);

      const { data, error } = await window.supabaseClient
        .from(this.tableName)
        .update(updateData)
        .eq('id', cardId)
        .select()
        .single();

      if (error) {
        console.error('Supabase update error:', error);
        throw error;
      }

      console.log('Card updated successfully:', data);
      return { success: true, data: data };
    } catch (error) {
      console.error('Failed to update card:', error);
      return { success: false, error: error.message };
    }
  }

  // Delete a card
  async deleteCard(cardId) {
    try {
      console.log('Deleting card:', cardId);

      const { error } = await window.supabaseClient
        .from(this.tableName)
        .delete()
        .eq('id', cardId);

      if (error) {
        console.error('Supabase delete error:', error);
        throw error;
      }

      console.log('Card deleted successfully');
      return { success: true };
    } catch (error) {
      console.error('Failed to delete card:', error);
      return { success: false, error: error.message };
    }
  }

  // Cancel a card (soft delete)
  async cancelCard(cardId) {
    return this.updateCard(cardId, {
      status: 'cancelled',
      cancelled_at: new Date().toISOString()
    });
  }

  // Restore a cancelled card
  async restoreCard(cardId) {
    return this.updateCard(cardId, {
      status: 'active',
      cancelled_at: null
    });
  }

  // Check for duplicates
  async checkDuplicate(cardData) {
    try {
      const { data, error } = await window.supabaseClient
        .from(this.tableName)
        .select('id')
        .eq('title', cardData.title.trim())
        .eq('description', cardData.description.trim())
        .eq('status', 'active')
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Duplicate check error:', error);
        return { isDuplicate: false };
      }

      return {
        isDuplicate: !!data,
        existingId: data?.id
      };
    } catch (error) {
      console.error('Failed to check duplicate:', error);
      return { isDuplicate: false };
    }
  }

  // Clean up duplicates
  async cleanupDuplicates() {
    try {
      console.log('Starting duplicate cleanup...');

      // Get all cards
      const { data: allCards, error } = await window.supabaseClient
        .from(this.tableName)
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Find duplicates
      const seen = new Map();
      const duplicates = [];

      allCards.forEach(card => {
        const key = `${card.title}-${card.description}-${card.end_time}`;
        if (seen.has(key)) {
          // Keep the newest, delete older ones
          const existingId = seen.get(key);
          const existingCard = allCards.find(c => c.id === existingId);
          const currentCard = card;

          if (new Date(currentCard.created_at) > new Date(existingCard.created_at)) {
            duplicates.push(existingId);
            seen.set(key, currentCard.id);
          } else {
            duplicates.push(currentCard.id);
          }
        } else {
          seen.set(key, card.id);
        }
      });

      // Delete duplicates
      if (duplicates.length > 0) {
        console.log(`Found ${duplicates.length} duplicates to delete`);

        const { error: deleteError } = await window.supabaseClient
          .from(this.tableName)
          .delete()
          .in('id', duplicates);

        if (deleteError) throw deleteError;

        console.log(`Deleted ${duplicates.length} duplicate cards`);
        return { success: true, deleted: duplicates.length };
      }

      return { success: true, deleted: 0 };
    } catch (error) {
      console.error('Cleanup failed:', error);
      return { success: false, error: error.message };
    }
  }
}

// Initialize the card manager
window.cardManager = new SupabaseCardManager();