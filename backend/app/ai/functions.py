"""
OpenAI function/tool definitions for function calling.
"""

TOOL_DEFINITIONS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "launch_app",
            "description": "Launch an application on the user's system. Only allowlisted applications can be launched.",
            "parameters": {
                "type": "object",
                "properties": {
                    "app_name": {
                        "type": "string",
                        "description": "Name of the application to launch (e.g., 'notepad', 'calculator', 'vscode', 'browser', 'explorer')",
                    },
                    "args": {
                        "type": "string",
                        "description": "Optional arguments to pass to the application",
                        "default": "",
                    },
                },
                "required": ["app_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "open_url",
            "description": "Open a URL in the user's default web browser.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL to open (must start with http:// or https://)",
                    },
                },
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the contents of a file from the filesystem.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Absolute path to the file to read",
                    },
                    "max_lines": {
                        "type": "integer",
                        "description": "Maximum number of lines to read (default: 200)",
                        "default": 200,
                    },
                },
                "required": ["file_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write content to a file. Creates the file if it doesn't exist.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Absolute path to the file to write",
                    },
                    "content": {
                        "type": "string",
                        "description": "Content to write to the file",
                    },
                    "append": {
                        "type": "boolean",
                        "description": "If true, append to the file instead of overwriting",
                        "default": False,
                    },
                },
                "required": ["file_path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_directory",
            "description": "List files and directories in a given path.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dir_path": {
                        "type": "string",
                        "description": "Absolute path to the directory to list",
                    },
                    "show_hidden": {
                        "type": "boolean",
                        "description": "Whether to show hidden files",
                        "default": False,
                    },
                },
                "required": ["dir_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_system_info",
            "description": "Get current system metrics including CPU, RAM, disk, battery, and network information.",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_time",
            "description": "Get the current date and time.",
            "parameters": {
                "type": "object",
                "properties": {
                    "timezone": {
                        "type": "string",
                        "description": "Timezone name (e.g., 'UTC', 'US/Eastern'). Defaults to local time.",
                        "default": "local",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": "Search current information using the configured keyless HTML search engine. Returns extracted page text and source URLs when available; blocked search pages and extraction errors are reported explicitly.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_music",
            "description": "Prepare YouTube playback or Spotify track selection for the desktop player. Spotify must be connected in JARVIS Settings. Ask for the artist or version if results are ambiguous. Never claim playback succeeded until the desktop player verifies it.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Song, artist, or playlist to search for"},
                    "service": {"type": "string", "enum": ["youtube", "spotify"], "default": "youtube"},
                },
                "required": ["query"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "control_media",
            "description": "Control the active Windows media session or send system volume keys. Playback controls report whether Windows accepted them; volume keys cannot confirm the exact resulting volume. This cannot select a song.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["play", "pause", "resume", "next", "previous", "stop", "volume_up", "volume_down", "mute"],
                    },
                },
                "required": ["action"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_directory",
            "description": "Create a new directory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dir_path": {
                        "type": "string",
                        "description": "Absolute path to the directory to create",
                    },
                },
                "required": ["dir_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_file_info",
            "description": "Get metadata about a file (size, modification date, etc.).",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Absolute path to the file",
                    },
                },
                "required": ["file_path"],
            },
        },
    },
]
