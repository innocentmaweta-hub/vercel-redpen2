<?php
/**
 * Plugin Name: RedPen User Meta
 * Description: Exposes RedPen's per-user session and grading-history storage through the WordPress REST API.
 * Version: 1.0.0
 */

defined('ABSPATH') || exit;

add_action('init', function () {
    $keys = [
        'redpen_sessions' => 'Saved RedPen course sessions.',
        'redpen_grading_history' => 'Saved RedPen grading history.',
    ];

    foreach ($keys as $key => $description) {
        register_meta('user', $key, [
            'type' => 'string',
            'description' => $description,
            'single' => true,
            'show_in_rest' => true,
            'sanitize_callback' => static function ($value) {
                return is_string($value) ? $value : wp_json_encode($value);
            },
            'auth_callback' => static function ($allowed, $meta_key, $object_id) {
                return current_user_can('edit_user', $object_id);
            },
        ]);
    }
});
