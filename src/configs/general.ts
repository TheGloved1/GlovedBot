import { env } from '@/env';

export const generalConfig: GeneralConfigType = {
  name: 'GlovedBot', // the name of your bot
  description: 'Private bot made by Gloves', // the description of your bot
  defaultLocale: 'en', // default language of the bot, must be a valid locale
  ownerId: env.BOT_OWNER_ID,
  timezone: 'Europe/Paris', // default TimeZone to well format and localize dates (logs, stats, etc)

  simpleCommandsPrefix: '?', // default prefix for simple command messages (old way to do commands on discord)
  automaticDeferring: true, // enable or not the automatic deferring of the replies of the bot on the command interactions

  // useful links
  links: {
    invite: '',
    supportServer: 'https://discord.gloved.dev',

    gitRemoteRepo: 'https://github.com/TheGloved1/GlovedBot.git',
  },

  automaticUploadImagesToImgur: false, // enable or not the automatic assets upload

  devs: [], // discord IDs of the devs that are working on the bot (you don't have to put the owner's id here)

  // define the bot activities (phrases under its name). Types can be: PLAYING, LISTENING, WATCHING, STREAMING
  activities: [
    {
      text: 'you',
      type: 'WATCHING',
    },
  ],
};

// global colors
export const colorsConfig = {
  primary: '#2F3136',
};
