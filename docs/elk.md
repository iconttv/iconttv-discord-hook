template schema

```
PUT _index_template/iconttv-discord-message_template
{
  "index_patterns": [
    "iconttv-discord-message_*" 
  ],
  "template": {
    "settings": {
      "number_of_shards": 3,
      "number_of_replicas": 0,
      "analysis": {
        "analyzer": {
          "korean_analyzer": {
            "type": "custom",
            "tokenizer": "nori_tokenizer",
            "filter": ["lowercase", "nori_part_of_speech"]
          }
        }
      }
    },
    "mappings": {
      "properties": {
        "messageId": {
          "type": "keyword"
        },
        "guildId": {
          "type": "keyword"
        },
        "channelId": {
          "type": "keyword"
        },
        "senderId": {
          "type": "keyword"
        },
        "deletedAt": {
          "type":"date",
          "format": "yyyy-MM-dd HH:mm:ss Z||yyyy-MM-dd HH:mm:ss ZZZ||yyyy-MM-dd HH:mm:ss 'UTC'||strict_date_optional_time||epoch_millis",
          "null_value": "1970-01-01T00:00:00Z" 
        },
        "editedAt": {
          "type":"date",
          "format": "yyyy-MM-dd HH:mm:ss Z||yyyy-MM-dd HH:mm:ss ZZZ||yyyy-MM-dd HH:mm:ss 'UTC'||strict_date_optional_time||epoch_millis",
          "null_value": "1970-01-01T00:00:00Z" 
        },
        "embeddingInput": {
          "search_analyzer": "korean_analyzer",
          "analyzer": "korean_analyzer",
          "type": "text"
        },
        "embeddingModel": {
          "type": "text"
        },
        "embedding": {
          "type": "dense_vector",
          "dims": 1024
        }
      }
    }
  }
}
```

## logstash
```
input {
  mongodb {
    uri => "mongodb://mongohost:27017/ICONTTV_DISCORD"
    collection => "discordMessages"
    placeholder_db_dir => "~/logstash-temp/"
    placeholder_db_name => "iconttv-discord-message_sqlite.db"
    batch_size => 3000
    generateId => false
    parse_method => "simple"
  }
}

filter {
  ruby { code => 'puts event.to_hash["_id"].inspect' }

  if [senderId] == "1149360270188220536" {
    drop { }
  }
  if ![createdAt] or [createdAt] == "" {
    drop { }
  }
  if ![EMBEDDING] or [EMBEDDING] == "" {
    drop { }
  }

  if ![deletedAt] or [deletedAt] == "" {
    mutate {
      replace => { "deletedAt" => "0" }
    }
  }
  if ![editedAt] or [editedAt] == "" {
    mutate {
      replace => { "editedAt" => "0" }
    }
  }

  date {
    match => [
      "createdAt",
      "yyyy-MM-dd HH:mm:ss Z",
      "yyyy-MM-dd HH:mm:ss ZZZ",
      "yyyy-MM-dd HH:mm:ss 'UTC'",
      "ISO8601"
    ]
    target => "@timestamp"
    timezone => "UTC"
  }

  mutate {
    remove_field => [
      "createdAt",
      "_id",
      "EMBEDDING_DIM",
      "EMBEDDING_STATUS",
      "TEXT_ATTACHMENTS",
      "TEXT_COMPONENTS",
      "TEXT_EMBEDS",
      "TEXT_MESSAGE",
      "__v",
      "attachments",
      "channelName",
      "components",
      "embeds",
      "guildName",
      "isDeleted",
      "message",
      "messageType",
      "raw",
      "senderName"
    ]
  }

  mutate {
    rename => {
      "EMBEDDING" => "embedding"
      "EMBEDDING_MODEL" => "embeddingModel"
      "EMBEDDING_INPUT" => "embeddingInput"
    }
  }
}


output {
  elasticsearch {
    hosts => ["https://kibana:9200"]
    index => "iconttv-discord-message_%{+YYYY.MM}"
    document_id => "%{guildId}_%{channelId}_%{messageId}"
    ssl_enabled => true
    ssl_verification_mode => "none"
    api_key => "secret_api_key"
  }
}
```