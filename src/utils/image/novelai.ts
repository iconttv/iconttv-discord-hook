import { config } from '../../config';
import logger from '../../lib/logger';
import { LogAiRequest } from '../../type';
import { retry } from 'es-toolkit';
import { processZip } from '../io';

const novelAiConfig = {
  API_URL: 'https://image.novelai.net/ai/generate-image',
  API_KEY: config.NOVELAI_API_KEY,
  MODEL: 'nai-diffusion-4-curated-preview',
  WIDTH: 1024,
  HEIGHT: 1024,
  SAMPLER: 'k_dpmpp_2m_sde',
  STEPS: 26,
  GUIDANCE: 6,
  NEGATIVE_PROMPT:
    'blurry, lowres, error, film grain, scan artifacts, worst quality, ' +
    'bad quality, jpeg artifacts, very displeasing, chromatic aberration, ' +
    'logo, dated, signature, multiple views, gigantic breasts, ' +
    '(nude, pussy, nipples, nipple, penis, sex:4)',
} as const;

export const generateImage = async (
  prompt: string,
  logAiRequest: LogAiRequest
) => {
  if (!novelAiConfig.API_KEY) {
    throw new Error('NOVELAI_API_KEY not set');
  }

  const input = `${prompt}, rating:general, best quality, very aesthetic, absurdres`;

  const fetchBody: RequestInit = {
    method: 'POST',
    body: JSON.stringify({
      input,
      model: novelAiConfig.MODEL,
      action: 'generate',
      parameters: {
        params_version: 3,
        width: novelAiConfig.WIDTH,
        height: novelAiConfig.HEIGHT,
        scale: novelAiConfig.GUIDANCE,
        sampler: novelAiConfig.SAMPLER,
        steps: novelAiConfig.STEPS,
        n_samples: 1,
        ucPreset: 0,
        qualityToggle: true,
        dynamic_thresholding: false,
        controlnet_strength: 1,
        legacy: false,
        add_original_image: true,
        cfg_rescale: 0,
        noise_schedule: 'karras',
        legacy_v3_extend: false,
        skip_cfg_above_sigma: null,
        use_coords: false,
        // seed: 3722663874,
        characterPrompts: [],
        v4_prompt: {
          caption: {
            base_caption: input,
            char_captions: [],
          },
          use_coords: false,
          use_order: true,
        },
        v4_negative_prompt: {
          caption: {
            base_caption: novelAiConfig.NEGATIVE_PROMPT,
            char_captions: [],
          },
        },
        negative_prompt: novelAiConfig.NEGATIVE_PROMPT,
        reference_image_multiple: [],
        reference_information_extracted_multiple: [],
        reference_strength_multiple: [],
      },
    }),
    headers: {
      Authorization: `Bearer ${novelAiConfig.API_KEY}`,
    },
  };

  const [imgBlob, revised_prompt] = await retry(
    async () => {
      const r = await fetch(novelAiConfig.API_URL, fetchBody);
      if (r.status === 429) {
        throw new Error(r.statusText);
      }
      return r;
    },
    { retries: 5, delay: 0.7 }
  )
    .then(async res => {
      const data = new Uint8Array(await res.arrayBuffer());
      const img = await processZip(data);
      return [img, input];
    })
    .catch(async e => {
      if (logAiRequest !== undefined) {
        await logAiRequest('novelai', novelAiConfig.MODEL, fetchBody, e).catch(
          e => logger.error(e)
        );
      }
      throw e;
    });

  return [imgBlob, revised_prompt];
};
