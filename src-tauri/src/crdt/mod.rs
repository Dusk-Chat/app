mod document;
pub mod sync;

use std::collections::HashMap;
use std::sync::Arc;

use automerge::AutoCommit;

use crate::protocol::community::{CategoryMeta, ChannelMeta, CommunityMeta};
use crate::protocol::messages::ChatMessage;
use crate::storage::DiskStorage;

// manages automerge documents for all joined communities
pub struct CrdtEngine {
    documents: HashMap<String, AutoCommit>,
    storage: Arc<DiskStorage>,
}

impl CrdtEngine {
    pub fn new(storage: Arc<DiskStorage>) -> Self {
        Self {
            documents: HashMap::new(),
            storage,
        }
    }

    // load all persisted community documents from disk
    pub fn load_all(&mut self) -> Result<(), String> {
        let community_ids = self
            .storage
            .list_communities()
            .map_err(|e| format!("failed to list communities: {}", e))?;

        for id in community_ids {
            if let Ok(bytes) = self.storage.load_document(&id) {
                match AutoCommit::load(&bytes) {
                    Ok(doc) => {
                        self.documents.insert(id, doc);
                    }
                    Err(e) => {
                        log::warn!("failed to load document for community {}: {}", id, e);
                    }
                }
            }
        }

        Ok(())
    }

    // create a new community with a default general channel
    pub fn create_community(
        &mut self,
        community_id: &str,
        name: &str,
        description: &str,
        created_by: &str,
    ) -> Result<(), String> {
        let mut doc = AutoCommit::new();
        document::init_community_doc(&mut doc, name, description, created_by)
            .map_err(|e| format!("failed to init community doc: {}", e))?;

        self.documents.insert(community_id.to_string(), doc);
        self.persist(community_id)?;
        Ok(())
    }

    // add a channel to an existing community
    pub fn create_channel(
        &mut self,
        community_id: &str,
        channel: &ChannelMeta,
    ) -> Result<(), String> {
        let doc = self
            .documents
            .get_mut(community_id)
            .ok_or("community not found")?;

        document::add_channel(doc, channel).map_err(|e| format!("failed to add channel: {}", e))?;

        self.persist(community_id)?;
        Ok(())
    }

    // get all channels in a community
    pub fn get_channels(&self, community_id: &str) -> Result<Vec<ChannelMeta>, String> {
        let doc = self
            .documents
            .get(community_id)
            .ok_or("community not found")?;

        document::get_channels(doc, community_id)
    }

    // reorder channels in a community
    pub fn reorder_channels(
        &mut self,
        community_id: &str,
        channel_ids: &[String],
    ) -> Result<Vec<ChannelMeta>, String> {
        let doc = self
            .documents
            .get_mut(community_id)
            .ok_or("community not found")?;

        let channels = document::reorder_channels(doc, community_id, channel_ids)?;
        self.persist(community_id)?;
        Ok(channels)
    }

    // add a category to a community
    pub fn create_category(
        &mut self,
        community_id: &str,
        category: &CategoryMeta,
    ) -> Result<(), String> {
        let doc = self
            .documents
            .get_mut(community_id)
            .ok_or("community not found")?;

        document::add_category(doc, category)
            .map_err(|e| format!("failed to add category: {}", e))?;

        self.persist(community_id)?;
        Ok(())
    }

    // get all categories in a community
    pub fn get_categories(&self, community_id: &str) -> Result<Vec<CategoryMeta>, String> {
        let doc = self
            .documents
            .get(community_id)
            .ok_or("community not found")?;

        document::get_categories(doc, community_id)
    }

    // append a message to a channel within a community
    pub fn append_message(
        &mut self,
        community_id: &str,
        message: &ChatMessage,
    ) -> Result<(), String> {
        let doc = self
            .documents
            .get_mut(community_id)
            .ok_or("community not found")?;

        document::append_message(doc, &message.channel_id, message)
            .map_err(|e| format!("failed to append message: {}", e))?;

        self.persist(community_id)?;
        Ok(())
    }

    // get messages for a channel, optionally paginated
    pub fn get_messages(
        &self,
        community_id: &str,
        channel_id: &str,
        before: Option<u64>,
        limit: usize,
    ) -> Result<Vec<ChatMessage>, String> {
        let doc = self
            .documents
            .get(community_id)
            .ok_or("community not found")?;

        document::get_messages(doc, channel_id, before, limit)
    }

    // get community metadata
    pub fn get_community_meta(&self, community_id: &str) -> Result<CommunityMeta, String> {
        let doc = self
            .documents
            .get(community_id)
            .ok_or("community not found")?;

        document::get_community_meta(doc, community_id)
    }

    // get all community ids we have documents for
    pub fn community_ids(&self) -> Vec<String> {
        self.documents.keys().cloned().collect()
    }

    // check if we have a document for a community
    pub fn has_community(&self, community_id: &str) -> bool {
        self.documents.contains_key(community_id)
    }

    // save a document to disk
    pub fn persist(&mut self, community_id: &str) -> Result<(), String> {
        let doc = self
            .documents
            .get_mut(community_id)
            .ok_or("community not found")?;

        let bytes = doc.save();
        self.storage
            .save_document(community_id, &bytes)
            .map_err(|e| format!("failed to persist document: {}", e))
    }

    // get a mutable reference to a document for sync operations
    pub fn get_doc_mut(&mut self, community_id: &str) -> Option<&mut AutoCommit> {
        self.documents.get_mut(community_id)
    }

    // get an immutable reference to a document
    pub fn get_doc(&self, community_id: &str) -> Option<&AutoCommit> {
        self.documents.get(community_id)
    }

    // insert or replace a document (used when receiving a full doc via sync)
    pub fn insert_doc(&mut self, community_id: &str, doc: AutoCommit) {
        self.documents.insert(community_id.to_string(), doc);
    }

    // get a specific message by id
    pub fn get_message(
        &self,
        community_id: &str,
        message_id: &str,
    ) -> Result<Option<ChatMessage>, String> {
        let doc = self
            .documents
            .get(community_id)
            .ok_or("community not found")?;

        document::get_message_by_id(doc, message_id)
    }

    // delete a message by id
    pub fn delete_message(&mut self, community_id: &str, message_id: &str) -> Result<(), String> {
        let doc = self
            .documents
            .get_mut(community_id)
            .ok_or("community not found")?;

        document::delete_message_by_id(doc, message_id)?;
        self.persist(community_id)?;
        Ok(())
    }

    // get all members of a community
    pub fn get_members(
        &self,
        community_id: &str,
    ) -> Result<Vec<crate::protocol::community::Member>, String> {
        let doc = self
            .documents
            .get(community_id)
            .ok_or("community not found")?;

        document::get_members(doc)
    }

    // remove a member from a community
    pub fn remove_member(&mut self, community_id: &str, peer_id: &str) -> Result<(), String> {
        let doc = self
            .documents
            .get_mut(community_id)
            .ok_or("community not found")?;

        document::remove_member(doc, peer_id)?;
        self.persist(community_id)?;
        Ok(())
    }

    // merge a remote document snapshot into our local state
    // if we don't have the community yet, insert it directly
    // if we do, merge the remote changes into our existing doc
    pub fn merge_remote_doc(
        &mut self,
        community_id: &str,
        remote_bytes: &[u8],
    ) -> Result<(), String> {
        let remote_doc = AutoCommit::load(remote_bytes)
            .map_err(|e| format!("failed to load remote doc: {}", e))?;

        if let Some(local_doc) = self.documents.get_mut(community_id) {
            local_doc
                .merge(&mut remote_doc.clone())
                .map_err(|e| format!("failed to merge docs: {}", e))?;
        } else {
            self.documents.insert(community_id.to_string(), remote_doc);
        }

        self.persist(community_id)?;
        Ok(())
    }

    // get the raw bytes of a document for sending to peers
    pub fn get_doc_bytes(&mut self, community_id: &str) -> Option<Vec<u8>> {
        self.documents.get_mut(community_id).map(|doc| doc.save())
    }

    // drop all in-memory documents (used during identity reset)
    pub fn clear(&mut self) {
        self.documents.clear();
    }
}
