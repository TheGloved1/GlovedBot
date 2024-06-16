/*
 * -------------------------------------------------------------------------------------------------------
 * Copyright (c) Vijay Meena <vijayymmeena@gmail.com> (https://github.com/samarmeena). All rights reserved.
 * Licensed under the Apache License. See License.txt in the project root for license information.
 * -------------------------------------------------------------------------------------------------------
 */
import { AudioPlayerStatus } from '@discordjs/voice';
import { QueueNode, RepeatMode } from '@discordx/music';
import { Category } from '@discordx/utilities';
import type { Client, CommandInteraction, Guild } from 'discord.js';
import {
  ApplicationCommandOptionType,
  EmbedBuilder,
  GuildMember,
} from 'discord.js';
import type { ArgsOf } from 'discordx';
import {
  ButtonComponent,
  Discord,
  On,
  Slash,
  SlashGroup,
  SlashOption,
} from 'discordx';
import fetch from 'isomorphic-unfetch';
import spotifyUrlInfo from 'spotify-url-info';
import { YouTube } from 'youtube-sr';

import { formatDurationFromMS, Queue } from './queue';

const spotify = spotifyUrlInfo(fetch);

@Discord()
@Category('Music')
// Create music group
@SlashGroup({ description: 'music', name: 'music' })
// Assign all slashes to music group
@SlashGroup('music')
export class music {

  queueNode: QueueNode | null = null;
  guildQueue = new Map<string, Queue>();

  getQueue({ client, guildId }: { client: Client, guildId: string }): Queue {
    if (!this.queueNode) {
      this.queueNode = new QueueNode(client);
    }

    let queue = this.guildQueue.get(guildId);
    if (!queue) {
      queue = new Queue({
        client,
        guildId,
        queueNode: this.queueNode,
      });

      this.guildQueue.set(guildId, queue);
    }

    return queue;
  }

  async processJoin(
    interaction: CommandInteraction
  ): Promise<{ guild: Guild, member: GuildMember, queue: Queue } | null> {
    await interaction.deferReply();

    if (
      !interaction.guild
      || !interaction.channel
      || !(interaction.member instanceof GuildMember)
    ) {
      await interaction.followUp(
        '> I apologize, but I am currently unable to process your request. Please try again later.'
      );

      setTimeout(() => void interaction.deleteReply(), 15e3);

      return null;
    }

    const { guild, member } = interaction;

    if (!member.voice.channel) {
      await interaction.followUp(
        '> It seems like you are not currently in a voice channel'
      );

      setTimeout(() => void interaction.deleteReply(), 15e3);

      return null;
    }

    const queue = this.getQueue({
      client: interaction.client,
      guildId: guild.id,
    });

    const bot = guild.members.cache.get(interaction.client.user.id);
    if (!bot?.voice.channelId) {
      queue.setChannel(interaction.channel);
      queue.join({
        channelId: member.voice.channel.id,
        guildId: guild.id,
      });
    } else if (bot.voice.channelId !== member.voice.channelId) {
      await interaction.followUp(
        '> I am not in your voice channel, therefore I cannot execute your request'
      );

      setTimeout(() => void interaction.deleteReply(), 15e3);

      return null;
    }

    return { guild, member, queue };
  }

  @On({ event: 'voiceStateUpdate' })
  handleVoiceState([, newState]: ArgsOf<'voiceStateUpdate'>): void {
    if (
      newState.member?.user.id === newState.client.user.id
      && newState.channelId === null
    ) {
      const guildId = newState.guild.id;
      const queue = this.guildQueue.get(guildId);
      if (queue) {
        queue.exit();
        this.guildQueue.delete(guildId);
      }
    }
  }

  @Slash({ description: 'Play a song', name: 'play' })
  async play(
    @SlashOption({
      description: 'song url or title',
      name: 'song',
      required: true,
      type: ApplicationCommandOptionType.String,
    })
    songName: string,
    @SlashOption({
      description: 'Start song from specific time',
      name: 'seek',
      required: false,
      type: ApplicationCommandOptionType.Number,
    })
    seek: number | undefined,
    interaction: CommandInteraction
  ): Promise<void> {
    const rq = await this.processJoin(interaction);
    if (!rq) {
      return;
    }

    const { queue, member } = rq;

    const video = await YouTube.searchOne(songName).catch(() => null);
    if (!video) {
      await interaction.followUp(
        `> Could not found song with keyword: \`${songName}\``
      );

      return;
    }

    queue.addTrack({
      duration: video.duration,
      seek,
      thumbnail: video.thumbnail?.url,
      title: video.title ?? 'NaN',
      url: video.url,
      user: member.user,
    });

    if (!queue.currentTrack) {
      queue.playNext();
    }

    const embed = new EmbedBuilder();
    embed.setTitle('Enqueued');
    embed.setDescription(
      `Enqueued song **${video.title ?? 'NaN'} (${formatDurationFromMS(
        video.duration
      )})**`
    );

    if (video.thumbnail?.url) {
      embed.setThumbnail(video.thumbnail.url);
    }

    await interaction.followUp({ embeds: [embed] });
  }

  @Slash({ description: 'Play youtube playlist', name: 'playlist' })
  async playlist(
    @SlashOption({
      description: 'Playlist name or url',
      name: 'playlist',
      required: true,
      type: ApplicationCommandOptionType.String,
    })
    playlistName: string,
    @SlashOption({
      description: 'Start song from specific time',
      name: 'seek',
      required: false,
      type: ApplicationCommandOptionType.Number,
    })
    seek: number | undefined,
    interaction: CommandInteraction
  ): Promise<void> {
    const rq = await this.processJoin(interaction);
    if (!rq) {
      return;
    }

    const { queue, member } = rq;

    const search = await YouTube.search(playlistName, {
      limit: 1,
      type: 'playlist',
    });

    const playlist = search[0];

    if (!playlist?.id) {
      await interaction.followUp('The playlist could not be found');

      return;
    }

    const pl = await YouTube.getPlaylist(playlist.id, { fetchAll: true });

    const tracks = pl.videos.map(video => ({
      duration: video.duration,
      seek,
      thumbnail: video.thumbnail?.url,
      title: video.title ?? 'NaN',
      url: video.url,
      user: member.user,
    }));

    queue.addTrack(...tracks);

    if (!queue.currentTrack) {
      queue.playNext();
    }

    const embed = new EmbedBuilder();
    embed.setTitle('Enqueued');
    embed.setDescription(
      `Enqueued  **${String(tracks.length)}** songs from playlist **${playlist.title ?? 'NA'}**`
    );

    if (playlist.thumbnail?.url) {
      embed.setThumbnail(playlist.thumbnail.url);
    }

    await interaction.followUp({ embeds: [embed] });
  }

  @Slash({ description: 'Play a spotify link', name: 'spotify' })
  async spotify(
    @SlashOption({
      description: 'Spotify url',
      name: 'url',
      required: true,
      type: ApplicationCommandOptionType.String,
    })
    url: string,
    @SlashOption({
      description: 'Start song from specific time',
      name: 'seek',
      required: false,
      type: ApplicationCommandOptionType.Number,
    })
    seek: number | undefined,
    interaction: CommandInteraction
  ): Promise<void> {
    const rq = await this.processJoin(interaction);
    if (!rq) {
      return;
    }

    const { queue, member } = rq;

    const result = await spotify.getTracks(url).catch(() => null);
    if (result === null) {
      await interaction.followUp(
        'The Spotify url you provided appears to be invalid, make sure that you have provided a valid url for Spotify'
      );

      return;
    }

    const videos = await Promise.all(
      result.map(track =>
        YouTube.searchOne(`${track.name} by ${track.artist}`)
      )
    );

    const tracks = videos.map(video => ({
      duration: video.duration,
      seek,
      thumbnail: video.thumbnail?.url,
      title: video.title ?? 'NaN',
      url: video.url,
      user: member.user,
    }));

    queue.addTrack(...tracks);

    if (!queue.currentTrack) {
      queue.playNext();
    }

    const embed = new EmbedBuilder();
    embed.setTitle('Enqueued');
    embed.setDescription(
      `Enqueued  **${String(tracks.length)}** songs from spotify playlist`
    );

    await interaction.followUp({ embeds: [embed] });
  }

  @Slash({
    description: 'Show details of currently playing song',
    name: 'current',
  })
  async current(interaction: CommandInteraction): Promise<void> {
    const rq = await this.processJoin(interaction);
    if (!rq) {
      return;
    }

    const { queue } = rq;

    const currentTrack = queue.currentTrack;
    if (!currentTrack) {
      await interaction.followUp('> Not playing anything at the moment.');

      return;
    }

    const embed = new EmbedBuilder();
    embed.setTitle('Current Track');
    embed.setDescription(
      `Playing **${currentTrack.title}** from **${formatDurationFromMS(
        queue.playbackInfo?.playbackDuration ?? 0
      )}/${formatDurationFromMS(currentTrack.duration)}**`
    );

    if (currentTrack.thumbnail) {
      embed.setImage(currentTrack.thumbnail);
    }

    await interaction.followUp({ embeds: [embed] });
  }

  @Slash({ description: 'Play current song on specific time', name: 'seek' })
  async seek(
    @SlashOption({
      description: 'time in seconds',
      name: 'seconds',
      required: true,
      type: ApplicationCommandOptionType.Number,
    })
    seconds: number,
    interaction: CommandInteraction
  ): Promise<void> {
    const rq = await this.processJoin(interaction);
    if (!rq) {
      return;
    }

    const { queue } = rq;

    const currentTrack = queue.currentTrack;

    if (!currentTrack) {
      await interaction.followUp(
        '> There doesn\'t seem to be anything to seek at the moment.'
      );

      return;
    }

    const time = seconds * 1000;

    if (time >= currentTrack.duration) {
      await interaction.followUp(
        `> Time should not be greater then ${formatDurationFromMS(
          currentTrack.duration
        )}`
      );

      return;
    }

    currentTrack.seek = seconds;
    queue.addTrackFirst(currentTrack);
    queue.skip();

    const embed = new EmbedBuilder();
    embed.setTitle('Seeked');
    embed.setDescription(
      `Playing **${currentTrack.title}** from **${formatDurationFromMS(
        time
      )}/${formatDurationFromMS(currentTrack.duration)}**`
    );

    await interaction.followUp({ embeds: [embed] });
  }

  @Slash({ description: 'View queue', name: 'queue' })
  async queue(interaction: CommandInteraction): Promise<void> {
    const rq = await this.processJoin(interaction);
    if (!rq) {
      return;
    }

    const { queue } = rq;
    await queue.view(interaction);
  }

  @Slash({ description: 'Pause current track', name: 'pause' })
  async pause(interaction: CommandInteraction): Promise<void> {
    const rq = await this.processJoin(interaction);
    if (!rq) {
      return;
    }

    const { queue } = rq;

    const currentTrack = queue.currentTrack;

    if (!currentTrack || !queue.isPlaying) {
      await interaction.followUp('> I am already quite, amigo!');

      return;
    }

    queue.pause();
    await interaction.followUp(`> paused ${currentTrack.title}`);
  }

  @Slash({ description: 'Resume current track', name: 'resume' })
  async resume(interaction: CommandInteraction): Promise<void> {
    const rq = await this.processJoin(interaction);
    if (!rq) {
      return;
    }

    const { queue } = rq;

    const currentTrack = queue.currentTrack;

    if (!currentTrack || queue.isPlaying) {
      await interaction.followUp(
        '> no no no, I am already doing my best, amigo!'
      );

      return;
    }

    queue.unpause();
    await interaction.followUp(`> resuming ${currentTrack.title}`);
  }

  @Slash({ description: 'Skip current song', name: 'skip' })
  async skip(interaction: CommandInteraction): Promise<void> {
    const rq = await this.processJoin(interaction);
    if (!rq) {
      return;
    }

    const { queue } = rq;

    const currentTrack = queue.currentTrack;

    if (!currentTrack) {
      await interaction.followUp(
        '> There doesn\'t seem to be anything to skip at the moment.'
      );

      return;
    }

    queue.skip();
    await interaction.followUp(`> skipped ${currentTrack.title}`);
  }

  @Slash({ description: 'Set volume', name: 'set-volume' })
  async setVolume(
    @SlashOption({
      description: 'Set volume',
      maxValue: 100,
      minValue: 0,
      name: 'volume',
      required: true,
      type: ApplicationCommandOptionType.Number,
    })
    volume: number,
    interaction: CommandInteraction
  ): Promise<void> {
    const rq = await this.processJoin(interaction);
    if (!rq) {
      return;
    }

    const { queue } = rq;

    queue.setVolume(volume);
    await interaction.followUp(`> volume set to ${String(volume)}`);
  }

  @Slash({ description: 'Stop music player', name: 'stop' })
  async stop(interaction: CommandInteraction): Promise<void> {
    const rq = await this.processJoin(interaction);
    if (!rq) {
      return;
    }

    const { queue, guild } = rq;

    queue.exit();
    this.guildQueue.delete(guild.id);

    await interaction.followUp('> adios amigo, see you later!');
  }

  @Slash({ description: 'Shuffle queue', name: 'shuffle' })
  async shuffle(interaction: CommandInteraction): Promise<void> {
    const rq = await this.processJoin(interaction);
    if (!rq) {
      return;
    }

    const { queue } = rq;
    queue.mix();
    await interaction.followUp('> playlist shuffled!');
  }

  @Slash({ description: 'Show GUI controls', name: 'gui-show' })
  async guiShow(interaction: CommandInteraction): Promise<void> {
    const rq = await this.processJoin(interaction);
    if (!rq || !interaction.channel) {
      return;
    }

    const { queue } = rq;

    queue.setChannel(interaction.channel);
    queue.startControlUpdate();
    await interaction.followUp('> Enable GUI mode!');
  }

  @Slash({ description: 'Hide GUI controls', name: 'gui-hide' })
  async guiHide(interaction: CommandInteraction): Promise<void> {
    const rq = await this.processJoin(interaction);
    if (!rq || !interaction.channel) {
      return;
    }

    const { queue } = rq;
    queue.stopControlUpdate();
    await interaction.followUp('> Disabled GUI mode!');
  }

  @ButtonComponent({ id: 'btn-next' })
  async nextControl(interaction: CommandInteraction): Promise<void> {
    if (!interaction.guildId) {
      return;
    }

    const { guildId, client } = interaction;
    const queue = this.getQueue({
      client,
      guildId,
    });

    queue.skip();

    await interaction.deferReply();
    await interaction.deleteReply();
  }

  @ButtonComponent({ id: 'btn-pause' })
  async pauseControl(interaction: CommandInteraction): Promise<void> {
    if (!interaction.guildId) {
      return;
    }

    const { guildId, client } = interaction;
    const queue = this.getQueue({
      client,
      guildId,
    });

    queue.playerState === AudioPlayerStatus.Paused
      ? queue.unpause()
      : queue.pause();

    await interaction.deferReply();
    await interaction.deleteReply();
  }

  @ButtonComponent({ id: 'btn-leave' })
  async leaveControl(interaction: CommandInteraction): Promise<void> {
    if (!interaction.guildId) {
      return;
    }

    const { guildId, client } = interaction;
    const queue = this.getQueue({
      client,
      guildId,
    });

    queue.exit();
    this.guildQueue.delete(interaction.guildId);

    await interaction.deferReply();
    await interaction.deleteReply();
  }

  @ButtonComponent({ id: 'btn-repeat' })
  async repeatControl(interaction: CommandInteraction): Promise<void> {
    if (!interaction.guildId) {
      return;
    }

    const { guildId, client } = interaction;
    const queue = this.getQueue({
      client,
      guildId,
    });

    queue.setRepeatMode(RepeatMode.All);

    await interaction.deferReply();
    await interaction.deleteReply();
  }

  @ButtonComponent({ id: 'btn-queue' })
  async queueControl(interaction: CommandInteraction): Promise<void> {
    if (!interaction.guildId) {
      return;
    }

    const { guildId, client } = interaction;
    const queue = this.getQueue({
      client,
      guildId,
    });

    await queue.view(interaction);
  }

  @ButtonComponent({ id: 'btn-mix' })
  async mixControl(interaction: CommandInteraction): Promise<void> {
    if (!interaction.guildId) {
      return;
    }

    const { guildId, client } = interaction;
    const queue = this.getQueue({
      client,
      guildId,
    });

    queue.mix();

    await interaction.deferReply();
    await interaction.deleteReply();
  }

  @ButtonComponent({ id: 'btn-controls' })
  async controlsControl(interaction: CommandInteraction): Promise<void> {
    if (!interaction.guildId) {
      return;
    }

    const { guildId, client } = interaction;
    const queue = this.getQueue({
      client,
      guildId,
    });

    await queue.updateControlMessage({ force: true });
    await interaction.deferReply();
    await interaction.deleteReply();
  }

  @ButtonComponent({ id: 'btn-loop' })
  async loopControl(interaction: CommandInteraction): Promise<void> {
    if (!interaction.guildId) {
      return;
    }

    const { guildId, client } = interaction;
    const queue = this.getQueue({
      client,
      guildId,
    });

    queue.setRepeatMode(RepeatMode.One);

    await interaction.deferReply();
    await interaction.deleteReply();
  }

}
