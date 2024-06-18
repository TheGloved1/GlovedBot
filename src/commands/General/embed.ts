import { Category } from '@discordx/utilities';
import { ApplicationCommandOptionType, CommandInteraction, EmbedBuilder, User } from 'discord.js';
import { Discord, Slash, SlashOption } from 'discordx';

import { colorsConfig } from '@/configs';
import { getColor } from '@/utils/functions';

@Discord()
@Category('General')
export default class EmbedCommand {

  @Slash({ name: 'embed', description: 'Create an embed with a title and description' })
  async embed(
    @SlashOption({ name: 'title', description: 'title of the embed', required: false, type: ApplicationCommandOptionType.String })
    title: string,
    @SlashOption({ name: 'description', description: 'description of the embed', required: false, type: ApplicationCommandOptionType.String })
    description: string,
    @SlashOption({ name: 'color', description: 'color of the embed', required: false, type: ApplicationCommandOptionType.Integer })
    color: number | undefined,
    interaction: CommandInteraction
  ) {
    const author = await interaction.user.fetch();
    const embed = new EmbedBuilder()
      .setTitle(title || '')
      .setDescription(description || '')
      .setColor(color || getColor('primary'))
      .setAuthor({ name: author.username, iconURL: author.avatarURL() as string });
    await interaction.followUp({
      embeds: [embed],
    });
  }

}
