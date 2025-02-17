'use strict';

const BaseMessageComponent = require('./BaseMessageComponent');
const MessageEmbed = require('./MessageEmbed');
const { RangeError } = require('../errors');
const { MessageComponentTypes } = require('../util/Constants');
const DataResolver = require('../util/DataResolver');
const MessageFlags = require('../util/MessageFlags');
const Util = require('../util/Util');

/**
 * Represents a message to be sent to the API.
 */
class APIMessage {
  /**
   * @param {MessageTarget} target - The target for this message to be sent to
   * @param {MessageOptions|WebhookMessageOptions} options - Options passed in from send
   */
  constructor(target, options) {
    /**
     * The target for this message to be sent to
     * @type {MessageTarget}
     */
    this.target = target;

    /**
     * Options passed in from send
     * @type {MessageOptions|WebhookMessageOptions}
     */
    this.options = options;

    /**
     * Data sendable to the API
     * @type {?Object}
     */
    this.data = null;

    /**
     * Files sendable to the API
     * @type {?Object[]}
     */
    this.files = null;
  }

  /**
   * Whether or not the target is a webhook
   * @type {boolean}
   * @readonly
   */
  get isWebhook() {
    const Webhook = require('./Webhook');
    const WebhookClient = require('../client/WebhookClient');
    return this.target instanceof Webhook || this.target instanceof WebhookClient;
  }

  /**
   * Whether or not the target is a user
   * @type {boolean}
   * @readonly
   */
  get isUser() {
    const User = require('./User');
    const GuildMember = require('./GuildMember');
    return this.target instanceof User || this.target instanceof GuildMember;
  }

  /**
   * Whether or not the target is a message
   * @type {boolean}
   * @readonly
   */
  get isMessage() {
    const Message = require('./Message');
    return this.target instanceof Message;
  }

  /**
   * Whether or not the target is an interaction
   * @type {boolean}
   * @readonly
   */
  get isInteraction() {
    const Interaction = require('./Interaction');
    const InteractionWebhook = require('./InteractionWebhook');
    return this.target instanceof Interaction || this.target instanceof InteractionWebhook;
  }

  /**
   * Makes the content of this message.
   * @returns {?(string|string[])}
   */
  makeContent() {
    let content;
    if (this.options.content === null) {
      content = '';
    } else if (typeof this.options.content !== 'undefined') {
      content = Util.verifyString(this.options.content, RangeError, 'MESSAGE_CONTENT_TYPE', false);
    }

    if (typeof content !== 'string') return content;

    const isSplit = typeof this.options.split !== 'undefined' && this.options.split !== false;
    const isCode = typeof this.options.code !== 'undefined' && this.options.code !== false;
    const splitOptions = isSplit ? { ...this.options.split } : undefined;

    if (content) {
      if (isCode) {
        const codeName = typeof this.options.code === 'string' ? this.options.code : '';
        content = `\`\`\`${codeName}\n${Util.cleanCodeBlockContent(content)}\n\`\`\``;
        if (isSplit) {
          splitOptions.prepend = `${splitOptions.prepend || ''}\`\`\`${codeName}\n`;
          splitOptions.append = `\n\`\`\`${splitOptions.append || ''}`;
        }
      }

      if (isSplit) {
        content = Util.splitMessage(content, splitOptions);
      }
    }

    return content;
  }

  /**
   * Resolves data.
   * @returns {APIMessage}
   */
  resolveData() {
    if (this.data) return this;
    const isInteraction = this.isInteraction;
    const isWebhook = this.isWebhook;
    const isWebhookLike = isInteraction || isWebhook;

    const content = this.makeContent();
    const tts = Boolean(this.options.tts);

    let nonce;
    if (typeof this.options.nonce !== 'undefined') {
      nonce = this.options.nonce;
      // eslint-disable-next-line max-len
      if (typeof nonce === 'number' ? !Number.isInteger(nonce) : typeof nonce !== 'string') {
        throw new RangeError('MESSAGE_NONCE_TYPE');
      }
    }

    const embedLikes = [];
    if (isWebhookLike) {
      if (this.options.embeds) {
        embedLikes.push(...this.options.embeds);
      }
    } else if (this.options.embed) {
      embedLikes.push(this.options.embed);
    }
    const embeds = embedLikes.map(e => new MessageEmbed(e).toJSON());

    const components = this.options.components?.map(c =>
      BaseMessageComponent.create(
        Array.isArray(c) ? { type: MessageComponentTypes.ACTION_ROW, components: c } : c,
      ).toJSON(),
    );

    let username;
    let avatarURL;
    if (isWebhook) {
      username = this.options.username || this.target.name;
      if (this.options.avatarURL) avatarURL = this.options.avatarURL;
    }

    let flags;
    if (this.isMessage) {
      // eslint-disable-next-line eqeqeq
      flags = this.options.flags != null ? new MessageFlags(this.options.flags).bitfield : this.target.flags.bitfield;
    } else if (isInteraction && this.options.ephemeral) {
      flags = MessageFlags.FLAGS.EPHEMERAL;
    }

    let allowedMentions =
      typeof this.options.allowedMentions === 'undefined'
        ? this.target.client.options.allowedMentions
        : this.options.allowedMentions;

    if (allowedMentions) {
      allowedMentions = Util.cloneObject(allowedMentions);
      allowedMentions.replied_user = allowedMentions.repliedUser;
      delete allowedMentions.repliedUser;
    }

    let message_reference;
    if (typeof this.options.reply === 'object') {
      const message_id = this.isMessage
        ? this.target.channel.messages.resolveID(this.options.reply.messageReference)
        : this.target.messages.resolveID(this.options.reply.messageReference);
      if (message_id) {
        message_reference = {
          message_id,
          fail_if_not_exists: this.options.reply.failIfNotExists ?? true,
        };
      }
    }

    this.data = {
      content,
      tts,
      nonce,
      embed: !isWebhookLike ? (this.options.embed === null ? null : embeds[0]) : undefined,
      embeds: isWebhookLike ? embeds : undefined,
      components,
      username,
      avatar_url: avatarURL,
      allowed_mentions:
        typeof content === 'undefined' && typeof message_reference === 'undefined' ? undefined : allowedMentions,
      flags,
      message_reference,
      attachments: this.options.attachments,
    };
    return this;
  }

  /**
   * Resolves files.
   * @returns {Promise<APIMessage>}
   */
  async resolveFiles() {
    if (this.files) return this;

    const embedLikes = [];
    if (this.isInteraction || this.isWebhook) {
      if (this.options.embeds) {
        embedLikes.push(...this.options.embeds);
      }
    } else if (this.options.embed) {
      embedLikes.push(this.options.embed);
    }

    const fileLikes = [];
    if (this.options.files) {
      fileLikes.push(...this.options.files);
    }
    for (const embed of embedLikes) {
      if (embed.files) {
        fileLikes.push(...embed.files);
      }
    }

    this.files = await Promise.all(fileLikes.map(f => this.constructor.resolveFile(f)));
    return this;
  }

  /**
   * Converts this APIMessage into an array of APIMessages for each split content
   * @returns {APIMessage[]}
   */
  split() {
    if (!this.data) this.resolveData();

    if (!Array.isArray(this.data.content)) return [this];

    const apiMessages = [];

    for (let i = 0; i < this.data.content.length; i++) {
      let data;
      let opt;

      if (i === this.data.content.length - 1) {
        data = { ...this.data, content: this.data.content[i] };
        opt = { ...this.options, content: this.data.content[i] };
      } else {
        data = { content: this.data.content[i], tts: this.data.tts, allowed_mentions: this.options.allowedMentions };
        opt = { content: this.data.content[i], tts: this.data.tts, allowedMentions: this.options.allowedMentions };
      }

      const apiMessage = new APIMessage(this.target, opt);
      apiMessage.data = data;
      apiMessages.push(apiMessage);
    }

    return apiMessages;
  }

  /**
   * Resolves a single file into an object sendable to the API.
   * @param {BufferResolvable|Stream|FileOptions|MessageAttachment} fileLike Something that could be resolved to a file
   * @returns {Object}
   */
  static async resolveFile(fileLike) {
    let attachment;
    let name;

    const findName = thing => {
      if (typeof thing === 'string') {
        return Util.basename(thing);
      }

      if (thing.path) {
        return Util.basename(thing.path);
      }

      return 'file.jpg';
    };

    const ownAttachment =
      typeof fileLike === 'string' || fileLike instanceof Buffer || typeof fileLike.pipe === 'function';
    if (ownAttachment) {
      attachment = fileLike;
      name = findName(attachment);
    } else {
      attachment = fileLike.attachment;
      name = fileLike.name || findName(attachment);
    }

    const resource = await DataResolver.resolveFile(attachment);
    return { attachment, name, file: resource };
  }

  /**
   * Creates an `APIMessage` from user-level arguments.
   * @param {MessageTarget} target Target to send to
   * @param {string|MessageOptions|WebhookMessageOptions} options Options or content to use
   * @param {MessageOptions|WebhookMessageOptions} [extra={}] - Extra options to add onto specified options
   * @returns {MessageOptions|WebhookMessageOptions}
   */
  static create(target, options, extra = {}) {
    return new this(
      target,
      typeof options !== 'object' || options === null ? { content: options, ...extra } : { ...options, ...extra },
    );
  }
}

module.exports = APIMessage;

/**
 * A target for a message.
 * @typedef {TextChannel|DMChannel|User|GuildMember|Webhook|WebhookClient|Interaction|InteractionWebhook} MessageTarget
 */
