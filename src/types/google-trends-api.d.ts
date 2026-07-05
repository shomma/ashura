declare module 'google-trends-api' {
  export type GoogleTrendsProperty = '' | 'images' | 'news' | 'youtube' | 'froogle';

  export type InterestOverTimeOptions = {
    keyword: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    hl?: string;
    timezone?: number;
    category?: number;
    property?: GoogleTrendsProperty;
  };

  export function interestOverTime(options: InterestOverTimeOptions): Promise<string>;
}
