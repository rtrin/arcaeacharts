# Arcaea Charts

A basic web application for browsing and searching Arcaea charts.

## Features

### **Search & Filtering**
- **Text Search**: Search by song title, artist, or chart constant
- **Difficulty Range**:  Slider for filtering by chart constant (1.0 - 12.0+)
- **Difficulty Types**: Filter by Future, Eternal, Beyond, and Inscribed difficulties

### **Chart View**
- **YouTube Integration**: Each song card includes a "Chart View" button
- **Fullscreen Video Player**: Videos open in a locked fullscreen overlay
- **Auto Search**: Automatically searches for chart view videos using YouTube API

### **Play Rating Calculator**
- **Interface**: Calculator appears when hovering over song cards
- **Calculation**: Uses Arcaea score modifier and play rating formulas (from the wiki)

## Technologies
- **Frontend**: React, TypeScript, Tailwind
- **Backend**: Supabase
- **Build Tool**: Vite

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Supabase account (for database)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/rtrin/arcaeacharts.git
   cd arcaeacharts
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   # Create a .env.local file
   echo "VITE_SUPABASE_URL=your_supabase_project_url" >> .env.local
   echo "VITE_SUPABASE_ANON_KEY=your_supabase_anon_key" >> .env.local
   
   # Optional: For YouTube chart view videos
   # Add the following to Vercel environment variables:
   YOUTUBE_API_KEY=your_youtube_api_key
   ```
   
   **Note**: The YouTube API key is optional. Without it, the app will show demo videos for chart view functionality.

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:5173`

For detailed Supabase setup instructions, see [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

## Data Pipeline

The `data-pipeline/` directory discovers song links from the Miraheze
[Song list](https://arcaea.miraheze.org/wiki/Song_list), scrapes each linked
page, validates the complete dataset, and syncs it to Supabase:

```bash
cd data-pipeline
pip install -r requirements.txt
python pipeline.py
```

The GitHub Actions workflow runs the sync daily at 4:00 UTC or manually from the Actions tab. Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the repository's `PROD` environment.

The pipeline uses bounded retries and rate limiting, writes validation
diagnostics to `data-pipeline/snapshots/`, and fails closed when the source is
incomplete. It supports Future, Eternal, Beyond, and Inscribed chart rows.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Guidelines
- Follow TypeScript best practices
- Use existing UI components from shadcn/ui
- Maintain responsive design principles
- Add proper error handling
- Include performance considerations

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

This project is unaffiliated with Arcaea and lowiro, as it is fanmade. Check  them out below:

- [Arcaea](https://arcaea.lowiro.com/)

Check out the Arcaea Wiki for more info about the game:

- [Arcaea Wiki](https://arcaea.fandom.com/wiki/Arcaea_Wiki)

## Support

If you find this project helpful, consider supporting it:

[![Ko-fi](https://storage.ko-fi.com/cdn/kofi5.png?v=6)](https://ko-fi.com/S6S41JCXEZ)

---

**Made by 8bits** | [Live Demo](https://arcaeacharts.vercel.app) | [Report Issues](https://github.com/rtrinh760/arcaeacharts/issues)
