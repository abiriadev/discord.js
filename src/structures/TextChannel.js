'use strict';

const GuildChannel = require('./GuildChannel');
const Webhook = require('./Webhook');
const TextBasedChannel = require('./interfaces/TextBasedChannel');
const MessageManager = require('../managers/MessageManager');
const Collection = require('../util/Collection');
const DataResolver = require('../util/DataResolver');

/**
 * Represents a guild text channel on Discord.
 * @extends {GuildChannel}
 * @implements {TextBasedChannel}
 */
class TextChannel extends GuildChannel {
  /**
   * @param {Guild} guild The guild the text channel is part of
   * @param {Object} data The data for the text channel
   */
  constructor(guild, data) {
    super(guild, data);
    /**
     * A manager of the messages sent to this channel
     * @type {MessageManager}
     */
    this.messages = new MessageManager(this);

    /**
     * If the guild considers this channel NSFW
     * @type {boolean}
     */
    this.nsfw = Boolean(data.nsfw);
    this._typing = new Map();
  }

  _patch(data) {
    super._patch(data);

    if ('topic' in data) {
      /**
       * The topic of the text channel
       * @type {?string}
       */
      this.topic = data.topic;
    }

    if ('nsfw' in data) {
      this.nsfw = Boolean(data.nsfw);
    }

    if ('last_message_id' in data) {
      /**
       * The ID of the last message sent in this channel, if one was sent
       * @type {?Snowflake}
       */
      this.lastMessageID = data.last_message_id;
    }

    if ('rate_limit_per_user' in data) {
      /**
       * The ratelimit per user for this channel in seconds
       * <warn>It is not currently possible to set a rate limit per user on a `NewsChannel`.</warn>
       * @type {number}
       */
      this.rateLimitPerUser = data.rate_limit_per_user;
    }

    if ('last_pin_timestamp' in data) {
      /**
       * The timestamp when the last pinned message was pinned, if there was one
       * @type {?number}
       */
      this.lastPinTimestamp = data.last_pin_timestamp ? new Date(data.last_pin_timestamp).getTime() : null;
    }

    if ('messages' in data) {
      for (const message of data.messages) this.messages.add(message);
    }
  }

  /**
   * Sets the rate limit per user for this channel.
   * <warn>It is not currently possible to set the rate limit per user on a `NewsChannel`.</warn>
   * @param {number} rateLimitPerUser The new ratelimit in seconds
   * @param {string} [reason] Reason for changing the channel's ratelimits
   * @returns {Promise<TextChannel>}
   */
  setRateLimitPerUser(rateLimitPerUser, reason) {
    return this.edit({ rateLimitPerUser }, reason);
  }

  /**
   * Sets whether this channel is flagged as NSFW.
   * @param {boolean} nsfw Whether the channel should be considered NSFW
   * @param {string} [reason] Reason for changing the channel's NSFW flag
   * @returns {Promise<TextChannel>}
   */
  setNSFW(nsfw, reason) {
    return this.edit({ nsfw }, reason);
  }

  /**
   * Sets the type of this channel (only conversion between text and news is supported)
   * @param {string} type The new channel type
   * @param {string} [reason] Reason for changing the channel's type
   * @returns {Promise<GuildChannel>}
   */
  setType(type, reason) {
    return this.edit({ type }, reason);
  }

  /**
   * Fetches all webhooks for the channel.
   * @returns {Promise<Collection<Snowflake, Webhook>>}
   * @example
   * // Fetch webhooks
   * channel.fetchWebhooks()
   *   .then(hooks => console.log(`This channel has ${hooks.size} hooks`))
   *   .catch(console.error);
   */
  fetchWebhooks() {
    return this.client.api.channels[this.id].webhooks.get().then(data => {
      const hooks = new Collection();
      for (const hook of data) hooks.set(hook.id, new Webhook(this.client, hook));
      return hooks;
    });
  }

  /**
   * Creates a webhook for the channel.
   * @param {string} name The name of the webhook
   * @param {Object} [options] Options for creating the webhook
   * @param {BufferResolvable|Base64Resolvable} [options.avatar] Avatar for the webhook
   * @param {string} [options.reason] Reason for creating the webhook
   * @returns {Promise<Webhook>} webhook The created webhook
   * @example
   * // Create a webhook for the current channel
   * channel.createWebhook('Snek', {
   *   avatar: 'https://i.imgur.com/mI8XcpG.jpg',
   *   reason: 'Needed a cool new Webhook'
   * })
   *   .then(console.log)
   *   .catch(console.error)
   */
  async createWebhook(name, { avatar, reason } = {}) {
    if (typeof avatar === 'string' && !avatar.startsWith('data:')) {
      avatar = await DataResolver.resolveImage(avatar);
    }
    return this.client.api.channels[this.id].webhooks
      .post({
        data: {
          name,
          avatar,
        },
        reason,
      })
      .then(data => new Webhook(this.client, data));
  }

  // These are here only for documentation purposes - they are implemented by TextBasedChannel
  /* eslint-disable no-empty-function */
  get lastMessage() {}
  get lastPinAt() {}
  send() {}
  startTyping() {}
  stopTyping() {}
  get typing() {}
  get typingCount() {}
  createMessageCollector() {}
  awaitMessages() {}
  createMessageComponentInteractionCollector() {}
  awaitMessageComponentInteraction() {}
  bulkDelete() {}
}

TextBasedChannel.applyToClass(TextChannel, true);

module.exports = TextChannel;
