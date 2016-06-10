module.exports = function(grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    browserify: {
      dev: {
        src: ['lib/exports.js'],
        dest: 'dist/reliable.js'
      }
    },

    uglify: {
      prod: {
        options: { mangle: true, compress: true },
        src: 'dist/reliable.js',
        dest: 'dist/reliable.min.js'
      }
    },

    concat: {
      dev: {
        options: {
          banner: '/*! <%= pkg.name %> build:<%= pkg.version %>, development. '+
            'Copyright(c) 2013 Michelle Bu <michelle@michellebu.com> */'
        },
        src: 'dist/reliable.js',
        dest: 'dist/reliable.js',
      },
      prod: {
        options: {
          banner: '/*! <%= pkg.name %> build:<%= pkg.version %>, production. '+
            'Copyright(c) 2013 Michelle Bu <michelle@michellebu.com> */'
        },
        src: 'dist/reliable.min.js',
        dest: 'dist/reliable.min.js',
      }
    }
  });

  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-concat');

  grunt.registerTask('default', ['browserify', 'uglify', 'concat']);
}