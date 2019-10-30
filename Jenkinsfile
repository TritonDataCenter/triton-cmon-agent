@Library('jenkins-joylib@v1.0.2') _

pipeline {

    agent {
        label joyCommonLabels(image_ver: '15.4.1')
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '90'))
        timestamps()
    }

    stages {
        stage('check') {
            steps{
                sh('make check')
            }
        }
        // avoid bundling devDependencies
        stage('re-clean') {
            steps {
                sh('git clean -fdx')
            }
        }
        stage('build image and upload') {
            steps { 
                sh('''
set -o errexit
set -o pipefail

export ENGBLD_BITS_UPLOAD_IMGAPI=true
make print-BRANCH print-STAMP all release publish bits-upload''')
            }
        }
        stage('agentsshar') {
            // TODO: Consider complex handling of multiple branches
            when {
                branch 'master'
            }
            steps {
                build(job:'agentsshar', wait: false)
            }
        }
    }

    post {
        always {
            joyMattermostNotification()
        }
    }

}
