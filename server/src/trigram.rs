use bincode::deserialize;
use serde::Deserialize;
use spacetimedb::rand;
use std::collections::HashMap;

#[derive(Deserialize)]
struct TrigramMap {
    trigrams: HashMap<String, Vec<String>>,
}

static TRIGRAM_MAP_BYTES: &[u8] = include_bytes!("../assets/trigram-words.bin");

lazy_static::lazy_static! {
    pub static ref TRIGRAM_MAP: HashMap<String, Vec<String>> = {
        let d: TrigramMap = deserialize(TRIGRAM_MAP_BYTES)
            .expect("Failed to deserialize trigram map");
        d.trigrams
    };
}

// Helper function to check if a word is valid
pub fn is_word_valid(word: &str, trigram: &str, used_words: &[String]) -> Result<(), String> {
    if used_words.contains(&word.to_string()) {
        return Err("Word has already been used".to_string());
    }
    match TRIGRAM_MAP.get(&trigram.to_uppercase()) {
        Some(words) => {
            if words.contains(&word.to_uppercase()) {
                return Ok(());
            }
            return Err("Word not in dictionary".to_string());
        }
        None => return Err("Trigram not found".to_string()),
    }
}

// Helper function to get random long words containing a trigram
pub fn get_example_words(trigram: &str, rng: &mut impl rand::RngCore) -> Vec<String> {
    if let Some(words) = TRIGRAM_MAP.get(&trigram.to_uppercase()) {
        // Filter for words longer than 10 characters
        let long_words: Vec<String> = words.iter().filter(|w| w.len() > 10).cloned().collect();

        if long_words.is_empty() {
            return Vec::new();
        }

        // Get up to 3 random words
        let mut selected_words = Vec::new();
        let mut indices: Vec<usize> = (0..long_words.len()).collect();

        // Shuffle indices
        for i in (1..indices.len()).rev() {
            let j = rng.next_u32() as usize % (i + 1);
            indices.swap(i, j);
        }

        // Take up to 3 words
        for &idx in indices.iter().take(3) {
            selected_words.push(long_words[idx].to_uppercase());
        }

        selected_words
    } else {
        Vec::new()
    }
}

// Helper function to get available trigrams that haven't been used yet
pub fn get_available_trigrams(used_trigrams: &[String]) -> Vec<String> {
    TRIGRAM_MAP
        .iter()
        .filter(|(t, words)| !used_trigrams.contains(t) && words.len() > 200)
        .map(|(t, _)| t.clone())
        .collect()
}
